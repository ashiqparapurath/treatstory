'use client';
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useCollection, useFirestore, useMemoFirebase, useDoc, useUser } from '@/firebase';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { SupportChatWorkspace } from '@/components/support-chat-workspace';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { SecureSupportClient, SecureConversation, SecureDevice, VerificationView } from '@/lib/support-matrix/client';
import type { SupportChatTicket } from '@/lib/support-conversation-types';
import type { MatrixEvent } from 'matrix-js-sdk';
import { MatrixEventEvent } from 'matrix-js-sdk';
import { VerificationPhase } from 'matrix-js-sdk/lib/crypto-api';

class SupportMatrixBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main role="alert" className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#fbf9f5] p-6 text-center"><h1 className="text-xl font-semibold">Encrypted support is temporarily unavailable</h1><p>Reload to retry without clearing browser storage.</p><Button onClick={() => location.reload()}>Reload support</Button><Link href="/support-tickets" className="underline">Use support tickets</Link></main> : this.props.children;
  }
}
export function SupportMatrixWorkspace(props: { team?: boolean }) {
  const { user } = useUser();
  return <SupportMatrixBoundary key={user?.uid ?? 'signed-out'}><SupportMatrixWorkspaceContent {...props}/></SupportMatrixBoundary>;
}
function SupportMatrixWorkspaceContent({ team = false }: { team?: boolean }) {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'support') : null, [db]);
  const { data: supportSettings } = useDoc<{ contactEmail?: string; publicNotice?: string }>(settingsRef);
  type RoutingRecord = Omit<SecureConversation, 'createdAt' | 'updatedAt'> & { createdAt: { toMillis(): number }; updatedAt: { toMillis(): number } };
  const ownRef = useMemoFirebase(() => db && user ? query(collection(db, 'support_matrix_conversations'), where('ownerUid', '==', user.uid), orderBy('updatedAt', 'desc'), limit(100)) : null, [db, user?.uid]);
  const assignedRef = useMemoFirebase(() => db && user && team ? query(collection(db, 'support_matrix_conversations'), where('agentUid', '==', user.uid), orderBy('updatedAt', 'desc'), limit(100)) : null, [db, user?.uid, team]);
  const own = useCollection<RoutingRecord>(ownRef);
  const assigned = useCollection<RoutingRecord>(assignedRef);
  const api = useRef<SecureSupportClient | null>(null);
  const tokenUser = useRef(user); tokenUser.current = user;
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [security, setSecurity] = useState(false);
  const knownDevices = useRef<Set<string> | null>(null);
  const [securityNotice, setSecurityNotice] = useState('');
  const [devices, setDevices] = useState<SecureDevice[]>([]);
  const [verification, setVerification] = useState<VerificationView | null>(null);
  const [tickets, setTickets] = useState<SecureConversation[]>([]);
  const [agents, setAgents] = useState<{ uid: string; userId: string; label?: string }[]>([]);
  const [agentUid, setAgentUid] = useState('');
  const [category, setCategory] = useState('other');
  const [orderId, setOrderId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const createId = useRef<string | null>(null);
  const frame = useRef<number | null>(null);
  const changed = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setRevision(value => value + 1); });
  }, []);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); changed(); } catch (e) { setError(e instanceof Error ? e.message : 'Secure messaging failed.'); }
    finally { setBusy(false); }
  }, [changed]);
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true; let local: SecureSupportClient | undefined;
    setLoading(true); setReady(false); setError('');
    void import('@/lib/support-matrix/client').then(async ({ SecureSupportClient }) => {
      local = new SecureSupportClient({ uid: user.uid, getIdToken: () => { if (!tokenUser.current || tokenUser.current.uid !== user.uid) throw new Error('Account changed.'); return tokenUser.current.getIdToken(); } }, changed, value => { if (active) { setVerification(value); if (value) setSecurity(true); } });
      if (!active) return;
      api.current = local;
      await local.start();
      if (!active) { local.stop(); return; }
      setLoading(false); changed();
    }).catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Secure messaging is unavailable.'); setLoading(false); } });
    return () => { active = false; local?.stop(); api.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  }, [user?.uid, changed]);
  useEffect(() => {
    const client = api.current;
    if (!client?.client || loading) return;
    let active = true;
    void Promise.all([client.ready(), client.devices()]).then(([trusted, list]) => { if (active) { setReady(trusted); setDevices(list); if ((knownDevices.current && list.some(device => !knownDevices.current!.has(device.id))) || (!knownDevices.current && list.some(device => !device.current && !device.verified))) { setSecurityNotice('A new messaging device was detected. Review your devices.'); setSecurity(true); } knownDevices.current = new Set(list.map(device => device.id)); } }).catch(() => {});
    return () => { active = false; };
  }, [revision, loading]);
  useEffect(() => {
    if (!api.current || loading) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.current!.api<{ tickets: SecureConversation[]; agents: { uid: string; userId: string; label?: string }[] }>(db ? 'conversations?agentsOnly=1' : 'conversations');
        if (!active) return;
        if (!db) setTickets(result.tickets); setAgents(result.agents);
        if (result.agents.length === 1) setAgentUid(result.agents[0].uid);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load conversations.'); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), db ? 30000 : 5000);
    return () => { active = false; clearInterval(timer); };
  }, [loading, user?.uid, db]);
  useEffect(() => {
    if (!db) return;
    if (own.error || assigned.error) { setTickets([]); setError('Conversation access changed or routing metadata is unavailable.'); return; }
    const merged = new Map([...(own.data ?? []), ...(assigned.data ?? [])].map(ticket => [ticket.id, ticket]));
    setTickets([...merged.values()].filter(ticket => ticket.status !== 'provisioning').map(ticket => ({ ...ticket, createdAt: ticket.createdAt?.toMillis() ?? 0, updatedAt: ticket.updatedAt?.toMillis() ?? 0 })));
  }, [db, own.data, assigned.data, own.error, assigned.error]);
  if (!user && !isUserLoading) return <main className="section-shell py-20"><h1 className="text-2xl">TreatStory encrypted support</h1><Link href="/login">Sign in to continue</Link></main>;
  const notice = <div className="flex flex-wrap items-center justify-between gap-2">
    {(supportSettings?.publicNotice || supportSettings?.contactEmail) && <div aria-label="Support contact information" className="w-full text-center">{supportSettings.publicNotice && <span>{supportSettings.publicNotice}</span>}{supportSettings.contactEmail && <a className="ml-3 underline" href={`mailto:${encodeURIComponent(supportSettings.contactEmail)}`}>{supportSettings.contactEmail}</a>}</div>}
    <Link href="/support-tickets" className="underline">Earlier support tickets</Link><span role={error ? 'alert' : 'status'}>{error || securityNotice || (!loading && api.current?.connectionState === 'ACCESS_DENIED' ? 'This device no longer has messaging access. Sign in again or review approved devices.' : !loading && !['SYNCING','PREPARED'].includes(api.current?.connectionState ?? '') ? 'Reconnecting to encrypted messaging…' : loading ? 'Preparing encrypted chat…' : ready ? 'Encrypted messaging · verified device' : 'Device pending · link an approved device or recover your account')}</span>
    <button className="underline" onClick={() => setSecurity(true)}>Devices and recovery</button>
  </div>;
  const mapped: SupportChatTicket[] = tickets.map(ticket => ({ ...ticket, participantLabel: team && ticket.ownerUid !== user?.uid ? ticket.ownerLabel || 'Customer' : ticket.agentLabel || 'TreatStory support', unread: api.current?.client?.getRoom(ticket.roomId)?.getUnreadNotificationCount() ?? 0, lastPreview: (() => { const last = api.current?.client ? api.current.messages(ticket.roomId).at(-1) : null; return last?.getWireType() === 'm.room.encrypted' && last.getType() === 'm.room.message' ? api.current?.readMessage(last) : undefined; })(), encrypted: true, createdAt: { toDate: () => new Date(ticket.createdAt) }, updatedAt: { toDate: () => new Date(ticket.updatedAt) } }));
  const newConversation = <form className="space-y-4 rounded-2xl border bg-white p-6" onSubmit={event => { event.preventDefault(); if (!api.current) return;
    void run(async () => {
      createId.current ??= crypto.randomUUID();
      const result = await api.current!.api<{ id: string; roomId: string }>('conversations', { action: 'create', requestId: createId.current, agentUid, category, orderId });
      createId.current = null;
      const list = await api.current!.api<{ tickets: SecureConversation[]; agents: { uid: string; userId: string; label?: string }[] }>('conversations');
      setTickets(list.tickets); setSelected(result.id);
    });
  }}>
    <h2 className="text-xl font-semibold">Start an encrypted conversation</h2>
    <p className="text-sm">Choose a support agent. Verify their identity in the conversation before your first message.</p>
    <label className="block text-sm">Support agent<Select required value={agentUid} onValueChange={value => { setAgentUid(value); createId.current = null; }}><SelectTrigger aria-label="Support agent"><SelectValue placeholder="Choose an agent"/></SelectTrigger><SelectContent position="popper" sideOffset={6} className="z-[260] max-h-[min(22rem,65dvh)]">{agents.map(agent => <SelectItem key={agent.uid} value={agent.uid}>{agent.label || 'Support ' + agent.uid.slice(0, 8)}</SelectItem>)}</SelectContent></Select></label>
    {!agents.length && <p role="status" className="text-sm">No enrolled support agent is available yet.</p>}
    <label htmlFor="support-topic" className="block text-sm">Topic<Select value={category} onValueChange={value => { setCategory(value); createId.current = null; }} disabled={busy}><SelectTrigger id="support-topic" aria-label="Support topic"><SelectValue/></SelectTrigger><SelectContent position="popper" sideOffset={6} className="z-[260] max-h-[min(22rem,65dvh)]"><SelectItem value="order">An order or cancellation</SelectItem><SelectItem value="delivery">Delivery or pickup</SelectItem><SelectItem value="payment">Payment</SelectItem><SelectItem value="seller">A seller or product</SelectItem><SelectItem value="account">My account</SelectItem><SelectItem value="other">Something else</SelectItem></SelectContent></Select></label>
    <label className="block text-sm">Order reference (optional)<Input value={orderId} maxLength={160} onChange={e => { setOrderId(e.target.value); createId.current = null; }}/></label>
    <p className="text-xs text-muted-foreground">Topic, order reference and participant identifiers are visible to TreatStory. Message bodies are encrypted.</p>
    <Button disabled={!ready || busy || !agentUid}>Start conversation</Button>
  </form>;
  return <>
    <SupportChatWorkspace title={team ? 'Encrypted care inbox' : 'Encrypted support'} backHref={team ? '/admin?tab=overview' : '/account'} backLabel="Back" tickets={mapped}
      isLoading={loading} openTicketId={selected} topNotice={notice} newConversation={newConversation}
      renderConversation={ticket => {
        const actual = tickets.find(item => item.id === ticket.id)!;
        return api.current?.client ? <MatrixThread key={actual.roomId} api={api.current} ticket={actual} uid={user!.uid} agentChoices={agents} ready={ready} revision={revision} onChange={changed} onError={setError}/> : <p className="p-6">Preparing encrypted messaging…</p>;
      }}/>
    <DialogPrimitive.Root open={security} onOpenChange={open => { if (!recoveryCode) setSecurity(open); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-[220] bg-black/40"/><DialogPrimitive.Content aria-describedby="secure-device-description" className="fixed left-1/2 top-1/2 z-[230] max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between"><DialogPrimitive.Title className="text-xl font-semibold">Devices and recovery</DialogPrimitive.Title><button aria-label="Close device settings" onClick={() => { if (!recoveryCode) setSecurity(false); }}>Close</button></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <DialogPrimitive.Description id="secure-device-description" className="text-sm">{ready ? 'This device is approved.' : 'Signing in does not unlock your encrypted history. Open an approved device and compare the verification symbols, or enter your saved recovery code.'}</DialogPrimitive.Description>
        {!ready && <Button disabled={busy || loading} onClick={() => void run(() => api.current!.link())}>Link from another device</Button>}
        {verification && <div className="space-y-3 rounded-xl border p-4" aria-live="polite">
          <p className="break-all text-sm">{verification.self ? 'Device linking' : 'Participant verification'} · {verification.otherDeviceId || verification.otherUserId}</p>
          {verification.phase === VerificationPhase.Requested && !verification.initiated && !verification.sas && <Button disabled={busy} onClick={() => void run(() => api.current!.acceptVerification())}>Accept verification request</Button>}
          {verification.phase === VerificationPhase.Ready && <Button disabled={busy} onClick={() => void run(() => api.current!.startVerification())}>Compare symbols</Button>}
          {verification.sas && <><p className="text-sm">Check both screens. Confirm only if every symbol and label matches.</p><div className="flex flex-wrap gap-3">{verification.sas.emoji?.map(([emoji, name]) => <span className="text-center" key={name}><span className="block text-2xl">{emoji}</span><span className="text-xs">{name}</span></span>)}</div><p>{verification.sas.decimal?.join(' · ')}</p><Button disabled={busy} onClick={() => void run(() => api.current!.confirmVerification())}>They match</Button></>}
          {verification.phase === VerificationPhase.Done ? <p>Verification complete.</p> : verification.phase === VerificationPhase.Cancelled ? <p>Verification cancelled. No device was approved.</p> : <button className="ml-3 underline" disabled={busy} onClick={() => void run(() => api.current!.cancelVerification())}>Reject / cancel</button>}
        </div>}
        <p className="text-xs" role="status">{api.current?.backupEnabled ? api.current.backupRemaining === 0 ? 'Encrypted history backup is up to date.' : 'Encrypted history backup is syncing. Keep this device available until it finishes.' : 'Encrypted recovery backup is not active on this device.'}</p>
        {!api.current?.recoveryConfigured && <p className="text-xs text-amber-900">Device-only backup does not recover history after every approved device is lost. Save a recovery code if you want that protection.</p>}
        {api.current?.recoveryProgress && <p role="status" className="text-xs">{api.current.recoveryProgress.imported} of {api.current.recoveryProgress.total} history keys restored.</p>}
        <ul className="space-y-2">{devices.map(device => <li key={device.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span>{device.name} {device.current && '(this device)'}<span className="block text-xs">{device.verified ? 'Verified' : 'Pending'} · {device.id}</span></span>{!device.current && ready && <button className="text-red-700 underline" disabled={busy} onClick={() => void run(async () => { await api.current!.api('devices', { deviceId: device.id }); })}>Revoke</button>}</li>)}</ul>
        {ready && !recoveryCode && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { setRecoveryCode(await api.current!.setupRecovery(code => setRecoveryCode(code))); })}>Set up recovery</Button>}
        {recoveryCode && <div className="space-y-3 rounded-xl border p-4"><p>Save this recovery code somewhere private. TreatStory cannot retrieve it for you.</p><pre className="whitespace-pre-wrap break-all text-sm">{recoveryCode}</pre><Button onClick={() => setRecoveryCode('')}>I saved my recovery code</Button></div>}
        {!ready && <form className="space-y-3" onSubmit={event => { event.preventDefault(); const code = recoveryInput; setRecoveryInput(''); void run(() => api.current!.recover(code)); }}><label className="block text-sm">Saved recovery code<Input type="password" autoComplete="off" value={recoveryInput} onChange={event => setRecoveryInput(event.target.value)}/></label><Button disabled={busy || !recoveryInput}>Recover encrypted history</Button><p className="text-xs">If every approved device is lost and recovery was never configured, encrypted history cannot be recovered. No keys will be silently reset.</p></form>}
    </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
  </>;
}

function MatrixThread({ api, ticket, uid, agentChoices, ready, revision, onChange, onError }: { api: SecureSupportClient; ticket: SecureConversation; uid: string; agentChoices: { uid: string; userId: string; label?: string }[]; ready: boolean; revision: number; onChange: () => void; onError: (value: string) => void }) {
  const [draft, setDraft] = useState(''); const [draftLoaded, setDraftLoaded] = useState(false); const [sending, setSending] = useState(false);
  const [legacyTickets, setLegacyTickets] = useState<{ id: string; category: string; createdAt: number; status: string; requiresPassphrase: boolean }[]>([]); const [legacyCursor, setLegacyCursor] = useState<string | null>(null);
  async function listLegacy(more = false) {
    try { const page = await api.api<{ tickets: typeof legacyTickets; next: string | null }>('legacy?roomId=' + encodeURIComponent(ticket.roomId) + (more && legacyCursor ? '&listAfter=' + encodeURIComponent(legacyCursor) : '')); setLegacyTickets(previous => more ? [...previous, ...page.tickets] : page.tickets); setLegacyCursor(page.next); } catch (e) { onError(e instanceof Error ? e.message : 'Earlier encrypted tickets are unavailable.'); }
  }
  const [legacyId, setLegacyId] = useState(''); const [oldPassphrase, setOldPassphrase] = useState(''); const [importing, setImporting] = useState(false); const [nextAgent, setNextAgent] = useState('');
  const [pageLoading, setPageLoading] = useState(false); const [online, setOnline] = useState(true);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const inflight = useRef(false); const end = useRef<HTMLDivElement>(null);
  const room = api.client.getRoom(ticket.roomId);
  const members = room?.getJoinedMembers().filter(member => member.userId !== api.userId && member.powerLevel < 100) ?? [];
  const peerId = members[0]?.userId ?? '';
  const events = api.messages(ticket.roomId);
  const connected = online && ['SYNCING','PREPARED'].includes(api.connectionState);
  const readUpTo = room?.getEventReadUpTo(peerId);
  const timeline = room?.getLiveTimeline().getEvents() ?? [];
  const readIndex = timeline.findIndex(event => event.getId() === readUpTo);
  useEffect(() => { let active = true; void api.loadDraft(ticket.roomId).then(text => { if (active) { setDraft(text); setDraftLoaded(true); } }).catch(() => { if (active) { onError('The saved draft could not be opened.'); setDraftLoaded(true); } }); return () => { active = false; }; }, [api, ticket.roomId, onError]);
  useEffect(() => { void api.join(ticket.roomId).then(onChange).catch(e => onError(e instanceof Error ? e.message : 'Unable to join conversation.')); }, [api, ticket.roomId, onChange, onError]);
  useEffect(() => {
    const decrypted = () => onChange(); events.forEach(event => event.on(MatrixEventEvent.Decrypted, decrypted));
    return () => events.forEach(event => event.off(MatrixEventEvent.Decrypted, decrypted));
  }, [api, ticket.roomId, revision, onChange]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); update(); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [events.at(-1)?.getId()]);
  useEffect(() => { const last = events.at(-1); if (last && !last.status && document.visibilityState === 'visible') void api.client.sendReadReceipt(last).catch(() => {}); }, [api, events.at(-1)?.getId()]);
  async function send() {
    if (inflight.current || !draft.trim()) return;
    inflight.current = true; setSending(true); onError('');
    try {
      if (!pending.current || pending.current.text !== draft) pending.current = { text: draft, id: crypto.randomUUID() };
      await api.send(ticket.roomId, draft, pending.current.id, peerId);
      pending.current = null; setDraft(''); await api.saveDraft(ticket.roomId, ''); onChange();
    } catch (e) { onError(e instanceof Error ? e.message : 'Message failed. Retry keeps the same message identifier.'); }
    finally { inflight.current = false; setSending(false); }
  }
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-white p-3 text-xs"><span>{connected ? 'Encrypted conversation' : 'Reconnecting · your draft stays here'}</span><div className="flex gap-3"><button className="underline" disabled={!ready || members.length !== 1} onClick={() => void api.verifyPeer(peerId).catch(e => onError(e.message))}>Verify participant</button><button className="underline" disabled={!ready} onClick={() => void api.api('conversations', { action: ticket.status === 'closed' ? 'reopen' : 'close', roomId: ticket.roomId }).then(onChange).catch(e => onError(e.message))}>{ticket.status === 'closed' ? 'Reopen' : 'Close'}</button></div></div>
    <details onToggle={event => { if (event.currentTarget.open) void listLegacy(); }} className="max-h-[30dvh] shrink-0 overflow-y-auto border-b bg-white px-4 py-2 text-xs"><summary>History import and conversation assignment</summary><div className="my-3 flex flex-wrap items-end gap-2"><label>Earlier encrypted conversation<Select value={legacyId} onValueChange={setLegacyId}><SelectTrigger aria-label="Earlier encrypted conversation"><SelectValue placeholder="Choose an earlier conversation"/></SelectTrigger><SelectContent position="popper" sideOffset={6} className="z-[260] max-h-[min(22rem,65dvh)]">{legacyTickets.map(source => <SelectItem key={source.id} value={source.id}>{source.category} · {source.createdAt ? new Date(source.createdAt).toLocaleDateString() : "Earlier ticket"} · {source.status}</SelectItem>)}</SelectContent></Select></label>{legacyCursor && <button className="underline" onClick={() => void listLegacy(true)}>Load more earlier conversations</button>}{legacyTickets.find(source => source.id === legacyId)?.requiresPassphrase && <label>Previous passphrase (version-1 history only)<Input type="password" autoComplete="off" value={oldPassphrase} onChange={e => setOldPassphrase(e.target.value)}/></label>}<Button disabled={!ready || importing || !legacyId || members.length !== 1} onClick={() => { setImporting(true); const passphrase = oldPassphrase; setOldPassphrase(''); void api.migrateHistory(legacyId, ticket.roomId, peerId, passphrase).then(() => { onError(''); onChange(); }).catch(e => onError(e.message)).finally(() => setImporting(false)); }}>{importing ? 'Importing…' : 'Import recoverable history'}</Button></div><p>Import runs on the original device, preserves source records, and resumes after interruption. It cannot reconstruct a lost key.</p><div className="my-3 flex items-end gap-2"><label>New support agent<Select value={nextAgent} onValueChange={setNextAgent}><SelectTrigger aria-label="New support agent"><SelectValue placeholder="Choose another support agent"/></SelectTrigger><SelectContent position="popper" sideOffset={6} className="z-[260] max-h-[min(22rem,65dvh)]">{agentChoices.filter(agent => ![uid, ticket.agentUid].includes(agent.uid)).map(agent => <SelectItem key={agent.uid} value={agent.uid}>{agent.label || "Support " + agent.uid.slice(0,8)}</SelectItem>)}</SelectContent></Select></label><Button variant="outline" disabled={!ready || !nextAgent} onClick={() => void api.api('conversations', { action: 'reassign', roomId: ticket.roomId, agentUid: nextAgent }).then(onChange).catch(e => onError(e.message))}>Reassign</Button></div><p>Verify the new agent before sending. They receive new messages; past history requires an explicit encrypted transfer from a participant who can read it.</p>{uid === ticket.ownerUid && <Button variant="outline" className="mt-3" disabled={!ready || importing || members.length !== 1} onClick={() => { setImporting(true); void api.shareHistory(ticket.roomId, peerId).then(() => { onError(''); onChange(); }).catch(e => onError(e.message)).finally(() => setImporting(false)); }}>Share earlier history with the verified agent</Button>}</details>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" role="log" aria-label="Encrypted messages">
      <button disabled={pageLoading} className="mx-auto block text-xs underline" onClick={() => { setPageLoading(true); void api.older(ticket.roomId).catch(e => onError(e.message)).finally(() => setPageLoading(false)); }}>{pageLoading ? 'Loading…' : 'Load older messages'}</button>
      {!events.length && <p className="text-center text-sm text-muted-foreground">Verify the participant, then send your first message.</p>}
      {events.map(event => <EncryptedBubble key={event.getId()} api={api} event={event} own={event.getSender() === api.userId} read={readIndex >= 0 && timeline.findIndex(item => item.getId() === event.getId()) >= 0 && readIndex >= timeline.findIndex(item => item.getId() === event.getId())}/>)}
      <div ref={end}/>
    </div>
    {ticket.status !== 'closed' ? <form className="shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); void send(); }}><div className="flex items-end gap-3"><label className="sr-only" htmlFor="secure-message">Message</label><textarea id="secure-message" rows={2} maxLength={2000} className="min-w-0 flex-1 resize-none rounded-xl border bg-[#faf8f5] p-3 text-sm" disabled={!draftLoaded || sending} value={draft} onChange={event => { setDraft(event.target.value); void api.saveDraft(ticket.roomId, event.target.value).catch(() => onError('Unable to save this draft on the device.')); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="Write a message…"/><Button aria-label="Send message" disabled={!ready || !connected || sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</Button></div></form> : <p className="shrink-0 border-t p-4 text-center text-sm">Conversation closed</p>}
  </div>;
}
function EncryptedBubble({ api, event, own, read }: { api: SecureSupportClient; event: MatrixEvent; own: boolean; read: boolean }) {
  const encrypted = event.getWireType() === 'm.room.encrypted';
  const content = event.getContent();
  const verifiedText = api.readMessage(event);
  const text = verifiedText ?? 'Encrypted message · waiting for verified content';
  return <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] rounded-2xl p-3 text-sm sm:max-w-[70%] ${own ? 'bg-[#e9e1d4]' : 'border bg-white'}`}><p className="whitespace-pre-wrap break-words">{text}</p>{verifiedText !== undefined && (content['org.treatstory.import'] || content['org.treatstory.transfer']) && <p className="mt-2 text-[10px]">Imported/shared history · original date supplied by the importing participant: {new Date((content['org.treatstory.import'] || content['org.treatstory.transfer']).timestamp).toLocaleString()}</p>}<p className="mt-2 text-right text-[10px] text-muted-foreground">{new Date(event.getTs()).toLocaleString()} {own && (event.status ? '· ' + event.status : read ? '· Read' : '· Sent')}</p></div></div>;
}
