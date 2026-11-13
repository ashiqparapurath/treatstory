'use client';
import { createClient, ClientEvent, RoomEvent, type MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { CryptoEvent, OnlySignedDevicesIsolationMode, VerificationPhase, VerificationRequestEvent, VerifierEvent,
  type VerificationRequest, type ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import { loadSupportDeviceKey } from '@/lib/support-device-key';
import { decryptSupportMessage, unlockSupportKey, type EncryptedSupportMessage, type LockedSupportKey } from '@/lib/support-encryption';
import type { Logger } from 'matrix-js-sdk/lib/logger';

type Account = { uid: string; getIdToken(): Promise<string> };
type Session = { accessToken: string; deviceId: string; userId: string; storageKey: Uint8Array };
export type SecureConversation = { id: string; roomId: string; ownerUid: string; agentUid: string; category: string; orderId: string; status: string; ownerLabel?: string; agentLabel?: string; ownerUserId: string; agentUserId: string; createdAt: number; updatedAt: number };
export type SecureDevice = { id: string; name: string; verified: boolean; current: boolean };
export type VerificationView = { otherUserId: string; otherDeviceId?: string; self: boolean; initiated: boolean; phase: VerificationPhase; sas?: ShowSasCallbacks['sas'] };
const quiet: Logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {}, getChild() { return quiet; } };
function localSession<T>(uid: string, operation: (store: IDBObjectStore, done: (value: T) => void) => void, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('treatstory-matrix-sessions-v1', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('sessions');
    open.onerror = () => reject(new Error('Secure device storage is unavailable.'));
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction('sessions', mode); let result: T;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Secure device storage failed. No identity was reset.')); };
      operation(tx.objectStore('sessions'), value => { result = value; });
    };
  });
}

export class SecureSupportClient {
  client!: MatrixClient;
  connectionState = 'STOPPED';
  backupRemaining: number | null = null;
  backupEnabled = false;
  recoveryConfigured = false;
  recoveryProgress: { total: number; imported: number } | null = null;
  private release?: () => void;
  private session!: Session;
  private serverRoot: string | null = null;
  private recoverySecret?: Uint8Array<ArrayBuffer>;
  private verification?: VerificationRequest;
  private sas?: ShowSasCallbacks;
  private verifierStarted = new WeakSet<object>();
  private restoredFlows = new WeakSet<VerificationRequest>();
  private disposers: (() => void)[] = [];
  private stopped = false;
  private encryptionQueue: Promise<void> = Promise.resolve();
  private encryptionScope: { roomId: string; agentUid: string } | null = null;
  private validated = new Map<string, Promise<boolean>>();
  private validationResults = new Map<string, boolean>();
  private replayed = new Set<string>();
  private fingerprints = new Map<string, string>();
  private draftWrites = new Map<string, Promise<void>>();
  constructor(private account: Account, private changed: () => void, private verificationChanged: (value: VerificationView | null) => void) {}
  get deviceId() { return this.session?.deviceId; }
  get userId() { return this.session?.userId; }
  async api<T>(path: string, body?: unknown): Promise<T> {
    if (this.stopped) throw new Error('This messaging session has stopped.');
    const response = await fetch('/api/support-matrix/' + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + await this.account.getIdToken(), 'Content-Type': 'application/json', ...(this.session ? { 'X-Matrix-Token': this.session.accessToken } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Secure messaging request failed.');
    return result as T;
  }
  async start() {
    if (!navigator.locks) throw new Error('This browser cannot safely coordinate encrypted chat tabs. Use a current browser.');
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request('treatstory-matrix:' + this.account.uid, { ifAvailable: true }, async lock => {
        if (!lock) { reject(new Error('Encrypted chat is already open in another tab. Close that tab and retry.')); return; }
        await new Promise<void>(done => { this.release = done; resolve(); });
      }).catch(reject);
    });
    try {
      const stored = await localSession<Session | undefined>(this.account.uid, (store, done) => {
        const read = store.get(this.account.uid); read.onsuccess = () => done(read.result);
      });
      if (stored) this.session = stored;
      else {
        const session = await this.api<Omit<Session, 'storageKey'>>('session', { name: /iPhone|iPad/.test(navigator.userAgent) ? 'TreatStory on iPhone or iPad' : /Android/.test(navigator.userAgent) ? 'TreatStory on Android' : /Macintosh/.test(navigator.userAgent) ? 'TreatStory on Mac' : /Windows/.test(navigator.userAgent) ? 'TreatStory on Windows' : 'TreatStory browser' });
        this.session = { ...session, storageKey: crypto.getRandomValues(new Uint8Array(32)) };
        await localSession(this.account.uid, (store, done) => { store.add(this.session, this.account.uid); done(undefined); }, 'readwrite');
      }
      if (this.stopped) { this.release?.(); return; }
      const baseUrl = location.origin + '/api/support-matrix/proxy';
      this.client = createClient({ baseUrl, userId: this.userId, accessToken: this.session.accessToken, deviceId: this.deviceId,
        verificationMethods: ['m.sas.v1'], logger: quiet,
        fetchFn: async (input, init) => {
          if (this.stopped) throw new Error('This messaging session has stopped.');
          const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
          if (target.origin !== location.origin || !target.pathname.startsWith('/api/support-matrix/proxy/_matrix/client/')) throw new Error('Messaging request outside the authorized gateway was blocked.');
          target.pathname = target.pathname.replace(/\/+$/, '');
          const headers = new Headers(init?.headers);
          headers.set('X-Treatstory-Auth', await this.account.getIdToken());
          headers.set('Authorization', 'Bearer ' + this.session.accessToken);
          if (this.encryptionScope && (target.pathname.includes('/sendToDevice/m.room.encrypted/') || target.pathname.includes('/send/m.room.encrypted/'))) {
            headers.set('X-Treatstory-Conversation', encodeURIComponent(this.encryptionScope.roomId));
            // Hashing a public account identifier here is a routing binding, not a key derivation.
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.encryptionScope.agentUid));
            headers.set('X-Treatstory-Agent', Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''));
          }
          return fetch(target.href, { ...init, headers, redirect: 'error' });
        },
        cryptoCallbacks: {
          getSecretStorageKey: async ({ keys }) => {
            if (!this.recoverySecret) throw new Error('Recovery requires your saved recovery code.');
            return [Object.keys(keys)[0], this.recoverySecret];
          },
          cacheSecretStorageKey: (_id, _info, key) => { this.recoverySecret = key; },
        },
      });
      await this.client.initRustCrypto({ useIndexedDB: true, cryptoDatabasePrefix: 'treatstory-matrix-' + this.account.uid, storageKey: this.session.storageKey });
      const cryptoApi = this.client.getCrypto()!;
      cryptoApi.globalBlacklistUnverifiedDevices = true;
      cryptoApi.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
      this.client.on(CryptoEvent.VerificationRequestReceived, request => this.watchVerification(request));
      this.client.on(CryptoEvent.KeyBackupStatus, enabled => { this.backupEnabled = enabled; this.changed(); });
      this.client.on(CryptoEvent.KeyBackupSessionsRemaining, remaining => { this.backupRemaining = remaining; this.changed(); });
      this.client.on(CryptoEvent.KeyBackupFailed, () => { this.backupRemaining = null; this.changed(); });
      this.client.on(CryptoEvent.DevicesUpdated, this.changed);
      this.client.on(CryptoEvent.UserTrustStatusChanged, this.changed);
      this.client.on(RoomEvent.Timeline, this.changed);
      this.client.on(RoomEvent.Receipt, this.changed);
      this.client.on(ClientEvent.Sync, (state, _previous, data) => { this.connectionState = data?.error && [401,403].includes((data.error as { httpStatus?: number }).httpStatus ?? 0) ? 'ACCESS_DENIED' : state; this.changed(); });
      this.client.on(ClientEvent.Event, this.changed);
      await this.client.startClient({ initialSyncLimit: 40, lazyLoadMembers: true });
      await new Promise<void>((resolve, reject) => {
        if (this.client.getSyncState() === 'PREPARED') { resolve(); return; }
        const timer = setTimeout(() => { this.client.off(ClientEvent.Sync, sync); reject(new Error('Secure messaging sync timed out. Try again without clearing browser storage.')); }, 30000);
        const sync = (state: string) => { if (state === 'PREPARED') { clearTimeout(timer); this.client.off(ClientEvent.Sync, sync); resolve(); } };
        this.client.on(ClientEvent.Sync, sync);
      });
      // Never reset an existing account root on an unfamiliar device.
      let createdIdentity = false;
      if (!(await cryptoApi.userHasCrossSigningKeys(undefined, true))) {
        try { await cryptoApi.bootstrapCrossSigning({ authUploadDeviceSigningKeys: makeRequest => makeRequest({}) }); createdIdentity = true; }
        catch (error) {
          if ((error as { httpStatus?: number }).httpStatus !== 409 || !(await this.api<{ masterKey: string | null }>('session')).masterKey) throw error;
          // A concurrent first device established the root. Keep this identity
          // pending and allow verified linking; never replace the winning root.
        }
      }
      this.serverRoot = (await this.api<{ masterKey: string | null }>('session')).masterKey;
      // Device-only encrypted backup enables normal verified-device history sync.
      // It is not loss recovery until the user explicitly saves a recovery code.
      if (createdIdentity && await cryptoApi.getCrossSigningKeyId() === this.serverRoot && !(await cryptoApi.getKeyBackupInfo())) await cryptoApi.resetKeyBackup();
      await cryptoApi.checkKeyBackupAndEnable();
      this.recoveryConfigured = await cryptoApi.isSecretStorageReady();
      this.changed();
    } catch (error) { this.stop(); throw error; }
  }
  stop() {
    this.stopped = true; this.connectionState = 'STOPPED';
    this.client?.stopClient(); this.client?.removeAllListeners();
    this.disposers.splice(0).forEach(dispose => dispose());
    this.recoverySecret?.fill(0); this.recoverySecret = undefined;
    this.release?.(); this.release = undefined;
  }
  async ready() {
    return !!this.client && !!this.serverRoot && await this.client.getCrypto()!.getCrossSigningKeyId() === this.serverRoot && !!(await this.client.getCrypto()!.getDeviceVerificationStatus(this.userId, this.deviceId))?.crossSigningVerified;
  }
  async devices(): Promise<SecureDevice[]> {
    const cryptoApi = this.client.getCrypto()!;
    await cryptoApi.getUserDeviceInfo([this.userId], true);
    const registered = await this.client.getDevices();
    return Promise.all(registered.devices.map(async device => ({ id: device.device_id, name: device.display_name ?? device.device_id,
      verified: !!(await cryptoApi.getDeviceVerificationStatus(this.userId, device.device_id))?.crossSigningVerified, current: device.device_id === this.deviceId })));
  }
  async link() { this.watchVerification(await this.client.getCrypto()!.requestOwnUserVerification()); }
  async verifyPeer(userId: string) {
    const cryptoApi = this.client.getCrypto()!;
    const devices = await cryptoApi.getUserDeviceInfo([userId], true);
    let device;
    for (const candidate of devices.get(userId)?.values() ?? []) if ((await cryptoApi.getDeviceVerificationStatus(userId, candidate.deviceId))?.signedByOwner) { device = candidate; break; }
    if (!device) throw new Error('The other participant must open encrypted chat on an approved device first.');
    this.watchVerification(await cryptoApi.requestDeviceVerification(userId, device.deviceId));
  }
  private watchVerification(request: VerificationRequest) {
    if (this.verification?.pending && this.verification !== request) { void request.cancel(); return; }
    this.verification = request; this.sas = undefined;
    const update = () => {
      if (this.stopped || this.verification !== request) return;
      this.verificationChanged({ otherUserId: request.otherUserId, otherDeviceId: request.otherDeviceId,
        self: request.isSelfVerification, initiated: request.initiatedByMe, phase: request.phase, sas: this.sas?.sas });
      const verifier = request.verifier;
      if (verifier && !this.verifierStarted.has(verifier)) {
        this.verifierStarted.add(verifier);
        const show = (sas: ShowSasCallbacks) => { this.sas = sas; update(); };
        verifier.on(VerifierEvent.ShowSas, show);
        const existing = verifier.getShowSasCallbacks(); if (existing) this.sas = existing;
        void verifier.verify().then(() => { this.changed(); update(); }).catch(() => update());
      }
      if (request.phase === VerificationPhase.Done && !this.restoredFlows.has(request)) {
        this.restoredFlows.add(request);
        this.changed();
        const timer = setTimeout(() => { if (!this.stopped) void this.restoreHistory().then(this.changed).catch(() => {}); }, 3000);
        this.disposers.push(() => clearTimeout(timer));
      }
    };
    request.on(VerificationRequestEvent.Change, update);
    this.disposers.push(() => request.off(VerificationRequestEvent.Change, update));
    update();
  }
  async acceptVerification() { await this.verification?.accept(); }
  async startVerification() {
    if (!this.verification) return;
    const verifier = await this.verification.startVerification('m.sas.v1');
    // startVerification emits Change and installs the verifier listener above.
    if (!this.verifierStarted.has(verifier)) this.watchVerification(this.verification);
  }
  async confirmVerification() { await this.sas?.confirm(); }
  async cancelVerification() { await this.verification?.cancel(); this.sas = undefined; }
  async setupRecovery(showCode?: (code: string) => void): Promise<string> {
    if (!(await this.ready())) throw new Error('Approve this device first.');
    const cryptoApi = this.client.getCrypto()!;
    if (await cryptoApi.isSecretStorageReady()) throw new Error('Recovery is already configured. It has not been replaced.');
    if (!(await cryptoApi.isCrossSigningReady()) || (await cryptoApi.getKeyBackupInfo() && !(await cryptoApi.getSessionBackupPrivateKey()))) throw new Error('Keep the original approved device open while security material finishes syncing, or configure recovery there.');
    if (!(await cryptoApi.getKeyBackupInfo())) await cryptoApi.resetKeyBackup();
    const key = await cryptoApi.createRecoveryKeyFromPassphrase();
    // Display the user-held code before network writes. A partial setup failure
    // must not leave secret storage initialized without a code the user can save.
    showCode?.(key.encodedPrivateKey!);
    this.recoverySecret = key.privateKey;
    try {
      await cryptoApi.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewKeyBackup: false });
      await cryptoApi.checkKeyBackupAndEnable();
      this.recoveryConfigured = await cryptoApi.isSecretStorageReady();
      return key.encodedPrivateKey!;
    } finally { this.recoverySecret = undefined; }
  }
  async restoreHistory() {
    if (!(await this.ready())) throw new Error('Approve this device first.');
    const api = this.client.getCrypto()!;
    await api.checkKeyBackupAndEnable();
    if (await api.getSessionBackupPrivateKey()) await api.restoreKeyBackup();
  }
  async recover(code: string) {
    this.recoverySecret = decodeRecoveryKey(code);
    try {
      const api = this.client.getCrypto()!;
      if (!(await this.client.secretStorage.getDefaultKeyId())) throw new Error('Recovery was never configured. Use an approved device; if all approved devices are lost, encrypted history may be unrecoverable. No keys were reset.');
      await api.bootstrapCrossSigning({ authUploadDeviceSigningKeys: makeRequest => makeRequest({}) });
      await api.loadSessionBackupPrivateKeyFromSecretStorage();
      const restored = await api.restoreKeyBackup({ progressCallback: progress => { if ('total' in progress) { this.recoveryProgress = { total: progress.total ?? 0, imported: progress.successes ?? 0 }; this.changed(); } } });
      this.recoveryProgress = restored;
      this.recoveryConfigured = await api.isSecretStorageReady();
      if (restored.imported < restored.total) throw new Error(`Only ${restored.imported} of ${restored.total} history keys could be restored. Original records were preserved.`);
      this.changed();
    } finally { this.recoverySecret?.fill(0); this.recoverySecret = undefined; }
  }
  async join(roomId: string) {
    if (this.client.getRoom(roomId)?.getMyMembership() !== 'join') await this.client.joinRoom(roomId);
  }
  private envelope(id: string, roomId: string) {
    return { version: 1, id, roomId, sender: this.userId, device: this.deviceId, timestamp: Date.now() };
  }
  /** Application replay protection atop Matrix AEAD: IDs and bindings are
   * inside the encrypted payload. Receipts contain public IDs only, not text. */
  private hasValidBinding(event: MatrixEvent) {
    const id = event.getId(); const content = event.getContent(); const binding = content['org.treatstory.envelope'];
    const localPending = !!event.status && event.getSender() === this.userId;
    if (!id || (!localPending && event.getWireType() !== 'm.room.encrypted') || event.getType() !== 'm.room.message' || typeof content.body !== 'string' ||
      binding?.version !== 1 || binding.roomId !== event.getRoomId() || binding.sender !== event.getSender() ||
      !Number.isSafeInteger(binding.timestamp) || binding.timestamp < 0 || binding.timestamp > 8640000000000000 ||
      typeof binding.device !== 'string' || typeof binding.id !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(binding.id)) return false;
    return true;
  }
  private fingerprint(event: MatrixEvent) { const wire = event.getWireContent(); return JSON.stringify([wire.algorithm, wire.session_id, wire.sender_key, wire.ciphertext]); }
  validateMessage(event: MatrixEvent): Promise<boolean> {
    if (!this.hasValidBinding(event)) return Promise.resolve(false);
    const id = event.getId()!; const binding = event.getContent()['org.treatstory.envelope'];
    if (event.status) return Promise.resolve(binding.sender === this.userId);
    const fingerprint = this.fingerprint(event);
    if (this.fingerprints.has(id) && this.fingerprints.get(id) !== fingerprint) return Promise.resolve(false);
    const cached = this.validated.get(id); if (cached) return cached;
    this.fingerprints.set(id, fingerprint);
    const receipt = ['receipt', this.account.uid, binding.roomId, binding.sender, binding.id];
    const check = crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)).then(hash => {
      const cipherHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      return localSession<boolean>(this.account.uid, (store, done) => {
      const read = store.get(receipt); read.onsuccess = () => {
        if (read.result) { const valid = read.result.eventId === id && read.result.cipherHash === cipherHash; if (!valid) this.replayed.add(id); done(valid); }
        else { store.add({ eventId: id, cipherHash }, receipt); done(true); }
      };
      }, 'readwrite');
    }).then(valid => { this.validationResults.set(id, valid); this.changed(); return valid; });
    this.validated.set(id, check); return check;
  }
  readMessage(event: MatrixEvent): string | undefined {
    if (!this.hasValidBinding(event)) return undefined;
    if (this.fingerprints.has(event.getId()!) && this.fingerprints.get(event.getId()!) !== this.fingerprint(event)) return undefined;
    if (event.status && event.getSender() === this.userId) return event.getContent().body;
    if (!this.validated.has(event.getId()!)) void this.validateMessage(event).catch(() => { this.validationResults.set(event.getId()!, false); this.changed(); });
    return this.validationResults.get(event.getId()!) ? event.getContent().body : undefined;
  }
  messages(roomId: string): MatrixEvent[] {
    const events = this.client.getRoom(roomId)?.getLiveTimeline().getEvents().filter(event => event.getWireType() === 'm.room.encrypted' || event.getType() === 'm.room.message') ?? [];
    for (const event of events) this.readMessage(event);
    return events.filter(event => !this.replayed.has(event.getId()!)).sort((a, b) => (a.getContent()['org.treatstory.import']?.timestamp ?? a.getContent()['org.treatstory.transfer']?.timestamp ?? a.getContent()['org.treatstory.envelope']?.timestamp ?? a.getTs()) - (b.getContent()['org.treatstory.import']?.timestamp ?? b.getContent()['org.treatstory.transfer']?.timestamp ?? b.getContent()['org.treatstory.envelope']?.timestamp ?? b.getTs()));
  }
  async older(roomId: string) {
    const room = this.client.getRoom(roomId); if (!room) return;
    await this.client.scrollback(room, 40); this.changed();
  }
  private async readDraftRecord(roomId: string): Promise<{ text: string; transactionId?: string }> {
    const record = await localSession<{ iv: Uint8Array; ciphertext: ArrayBuffer } | undefined>(this.account.uid, (store, done) => {
      const read = store.get(['draft', this.account.uid, roomId]); read.onsuccess = () => done(read.result);
    });
    if (!record) return { text: '' };
    const key = await crypto.subtle.importKey('raw', this.session.storageKey as BufferSource, 'AES-GCM', false, ['decrypt']);
    const plaintext = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv as BufferSource }, key, record.ciphertext));
    try { const saved = JSON.parse(plaintext); if (typeof saved.text === 'string') return saved; } catch {}
    return { text: plaintext }; // Read earlier draft format without discarding it.
  }
  async loadDraft(roomId: string) { return (await this.readDraftRecord(roomId)).text; }
  saveDraft(roomId: string, text: string, transactionId?: string) {
    const previous = this.draftWrites.get(roomId) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const key = await crypto.subtle.importKey('raw', this.session.storageKey as BufferSource, 'AES-GCM', false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ text, transactionId })));
      await localSession(this.account.uid, (store, done) => { store.put({ iv, ciphertext }, ['draft', this.account.uid, roomId]); done(undefined); }, 'readwrite');
    });
    this.draftWrites.set(roomId, write);
    return write;
  }
  async migrateHistory(ticketId: string, roomId: string, peer: string, previousPassphrase?: string) {
    if (!(await this.ready()) || !(await this.client.getCrypto()!.getUserVerificationStatus(peer)).isVerified()) throw new Error('Verify this device and the conversation participant before importing history.');
    if (!(await this.client.getCrypto()!.isEncryptionEnabledInRoom(roomId))) throw new Error('The history destination must be encrypted.');
    let cursor: string | null = null;
    let count = 0;
    do {
      const page: { source: Record<string, unknown>; messages: (EncryptedSupportMessage & { id: string; senderUid: string; createdAt: number; migrated: boolean })[]; role: 'owner' | 'team'; publicKey: JsonWebKey; lockedKey: LockedSupportKey | null; next: string | null } = await this.api('legacy?ticketId=' + encodeURIComponent(ticketId) + '&roomId=' + encodeURIComponent(roomId) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      const local = await loadSupportDeviceKey(page.role === 'team' ? 'team:' + this.account.uid : this.account.uid);
      let key: CryptoKey;
      if (page.lockedKey && previousPassphrase) key = await unlockSupportKey(page.lockedKey, previousPassphrase);
      else if (local && local.publicKey.n === page.publicKey.n && local.publicKey.e === page.publicKey.e) key = local.privateKey;
      else throw new Error('Open the original browser to import this history. Older passphrase-protected history requires its previous passphrase in this import step only. No identity has been reset.');
      for (const message of page.messages) {
        if (message.migrated) continue;
        const reservation = await this.api<{ skip: boolean }>('legacy', { action: 'reserve', ticketId, roomId, messageId: message.id });
        if (reservation.skip) continue;
        const text = await decryptSupportMessage(message, key, page.role);
        const source = { ticketId, messageId: message.id, senderUid: message.senderUid, timestamp: message.createdAt, conversation: page.source };
        const id = 'legacy-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticketId + ':' + message.id))), byte => byte.toString(16).padStart(2, '0')).join('');
        const event = await this.encryptForConversation(roomId, { msgtype: 'm.text', body: text, 'org.treatstory.envelope': this.envelope(id, roomId), 'org.treatstory.import': source }, id, peer);
        const roundTrip = new MatrixEvent(await this.client.fetchRoomEvent(roomId, event.event_id));
        await this.client.decryptEventIfNeeded(roundTrip);
        if (roundTrip.getContent().body !== text || roundTrip.getContent()['org.treatstory.import']?.messageId !== message.id) throw new Error('Imported message verification failed. Original history is unchanged.');
        await this.api('legacy', { action: 'commit', ticketId, roomId, messageId: message.id, eventId: event.event_id });
        count++;
      }
      cursor = page.next;
    } while (cursor);
    return count;
  }
  async shareHistory(roomId: string, peer: string) {
    const cryptoApi = this.client.getCrypto()!;
    if (!(await this.ready()) || !(await cryptoApi.isEncryptionEnabledInRoom(roomId)) || !(await cryptoApi.getUserVerificationStatus(peer)).isVerified()) throw new Error('Verify your device and the new support agent before sharing history.');
    const ticket = (await this.api<{ tickets: SecureConversation[] }>('conversations')).tickets.find(ticket => ticket.roomId === roomId);
    if (!ticket || ticket.ownerUid !== this.account.uid || ticket.agentUserId !== peer || ticket.status !== 'open') throw new Error('Conversation assignment changed.');
    const room = this.client.getRoom(roomId)!;
    while (room.oldState.paginationToken) {
      if (this.stopped) throw new Error('History sharing paused. Resume on this device.');
      await this.client.scrollback(room, 100);
    }
    const sources = [...this.messages(roomId)]; let count = 0;
    for (const source of sources) {
      if (this.stopped) throw new Error('History sharing paused. Resume on this device.');
      await this.client.decryptEventIfNeeded(source);
      if (source.getContent()['org.treatstory.transfer']) continue;
      if (!(await this.validateMessage(source))) throw new Error('An earlier message failed replay or binding checks. Original history was preserved.');
      if (source.isDecryptionFailure()) throw new Error('A historical message is still locked. Recover its key before transferring it.');
      if (source.getType() !== 'm.room.message' || typeof source.getContent().body !== 'string' || source.status) continue;
      const sourceEventId = source.getId()!;
      const receipt = { roomId, agentUid: ticket.agentUid, sourceEventId };
      if ((await this.api<{ skip: boolean }>('transfers', { action: 'reserve', ...receipt })).skip) continue;
      const metadata = { sourceEventId, sender: source.getSender(), timestamp: source.getContent()['org.treatstory.import']?.timestamp ?? source.getTs(), recipient: peer };
      const id = 'transfer-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(peer + ':' + sourceEventId))), byte => byte.toString(16).padStart(2, '0')).join('');
      const sent = await this.encryptForConversation(roomId, { msgtype: 'm.text', body: source.getContent().body, 'org.treatstory.envelope': this.envelope(id, roomId), 'org.treatstory.transfer': metadata }, id, peer);
      const roundTrip = new MatrixEvent(await this.client.fetchRoomEvent(roomId, sent.event_id)); await this.client.decryptEventIfNeeded(roundTrip);
      if (roundTrip.getContent().body !== source.getContent().body || roundTrip.getContent()['org.treatstory.transfer']?.sourceEventId !== sourceEventId) throw new Error('History transfer verification failed. Original messages were preserved.');
      await this.api('transfers', { action: 'commit', ...receipt, eventId: sent.event_id }); count++;
    }
    return count;
  }
  private encryptForConversation(roomId: string, content: Record<string, unknown>, id: string, peer: string, pending?: MatrixEvent) {
    const operation = this.encryptionQueue.catch(() => {}).then(async () => {
      const ticket = (await this.api<{ tickets: SecureConversation[] }>('conversations')).tickets.find(ticket => ticket.roomId === roomId);
      if (!ticket || ticket.status !== 'open' || ![ticket.ownerUserId, ticket.agentUserId].includes(peer) || peer === this.userId) throw new Error('Conversation membership or status changed.');
      if (!(await this.ready()) || !(await this.client.getCrypto()!.isEncryptionEnabledInRoom(roomId)) || !(await this.client.getCrypto()!.getUserVerificationStatus(peer)).isVerified()) throw new Error('Verify your device and the conversation participant before sending.');
      this.encryptionScope = { roomId, agentUid: ticket.agentUid };
      try {
        this.backupRemaining = null;
        if (pending) return await this.client.resendEvent(pending, this.client.getRoom(roomId)!);
        await this.client.getCrypto()!.forceDiscardSession(roomId);
        return await this.client.sendEvent(roomId, 'm.room.message' as never, content as never, id);
      } finally { this.encryptionScope = null; }
    });
    this.encryptionQueue = operation.then(() => {}, () => {});
    return operation;
  }
  async send(roomId: string, text: string, transactionId: string, peer: string) {
    if (!text.trim() || text.length > 2000) throw new Error('Write a message of 1–2000 characters.');
    if (!(await this.ready())) throw new Error('Approve this device before sending messages.');
    const ticket = (await this.api<{ tickets: SecureConversation[] }>('conversations')).tickets.find(ticket => ticket.roomId === roomId);
    if (!ticket || ticket.status !== 'open' || ![ticket.ownerUserId, ticket.agentUserId].includes(peer) || peer === this.userId) throw new Error('Conversation membership or status changed.');
    const unexpected = this.client.getRoom(roomId)?.getJoinedMembers().some(member => member.powerLevel < 100 && ![ticket.ownerUserId, ticket.agentUserId].includes(member.userId));
    if (unexpected) throw new Error('Unexpected conversation participant. Sending is blocked.');
    const api = this.client.getCrypto()!;
    if (!(await api.isEncryptionEnabledInRoom(roomId))) throw new Error('This room is not encrypted.');
    if (!(await api.getUserVerificationStatus(peer)).isVerified()) throw new Error('Verify the conversation participant before the first message.');
    const stored = await this.readDraftRecord(roomId);
    if (stored.text === text && stored.transactionId) transactionId = stored.transactionId;
    await this.saveDraft(roomId, text, transactionId);
    const pending = this.client.getRoom(roomId)?.getLiveTimeline().getEvents().find(event => event.getTxnId() === transactionId);
    if (pending && (!pending.status || pending.status === 'sent')) { await this.saveDraft(roomId, ''); return { event_id: pending.getId()! }; }
    const result = await this.encryptForConversation(roomId, { msgtype: 'm.text', body: text.trim(), 'org.treatstory.envelope': this.envelope(transactionId, roomId) }, transactionId, peer, pending);
    await this.saveDraft(roomId, '');
    return { event_id: result.event_id };
  }
}
export { VerificationPhase };
