'use client';

export type PublicSupportKey = JsonWebKey;
export type LockedSupportKey = { publicKey: JsonWebKey; lockedPrivateKey: string; salt: string; iv: string; version: 1 };
export type EncryptedSupportMessage = { ciphertext: string; iv: string; ownerKey: string; teamKey: string; version: 1 };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const unb64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const bytes = (value: ArrayBuffer) => new Uint8Array(value);

async function passwordKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt: salt as BufferSource,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function generateSupportKey(passphrase: string): Promise<LockedSupportKey> {
  if (passphrase.length < 12) throw new Error('Choose an encryption passphrase of at least 12 characters.');
  const pair = await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]) as BufferSource,hash:'SHA-256'},true,['encrypt','decrypt']);
  const publicKey = await crypto.subtle.exportKey('jwk',pair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk',pair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(passphrase,salt);
  const locked = await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},key,encoder.encode(JSON.stringify(privateKey)) as BufferSource);
  return {publicKey,lockedPrivateKey:b64(bytes(locked)),salt:b64(salt),iv:b64(iv),version:1};
}

export async function unlockSupportKey(record: LockedSupportKey, passphrase: string): Promise<CryptoKey> {
  try {
    const key = await passwordKey(passphrase,unb64(record.salt));
    const raw = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv) as BufferSource},key,unb64(record.lockedPrivateKey) as BufferSource);
    return await crypto.subtle.importKey('jwk',JSON.parse(decoder.decode(raw)) as JsonWebKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  } catch {
    throw new Error('Unable to unlock messages. Check your encryption passphrase.');
  }
}

async function importPublic(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
}

export async function encryptSupportMessage(message: string, ownerPublic: JsonWebKey, teamPublic: JsonWebKey): Promise<EncryptedSupportMessage> {
  if (!message.trim() || message.length > 2000) throw new Error('Message must be 1–2000 characters.');
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey('raw',secret as BufferSource,'AES-GCM',false,['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const [cipher,ownerKey,teamKey] = await Promise.all([
    crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},aesKey,encoder.encode(message.trim()) as BufferSource),
    importPublic(ownerPublic).then(key => crypto.subtle.encrypt({name:'RSA-OAEP'},key,secret as BufferSource)),
    importPublic(teamPublic).then(key => crypto.subtle.encrypt({name:'RSA-OAEP'},key,secret as BufferSource)),
  ]);
  return {ciphertext:b64(bytes(cipher)),iv:b64(iv),ownerKey:b64(bytes(ownerKey)),teamKey:b64(bytes(teamKey)),version:1};
}

export async function decryptSupportMessage(message: EncryptedSupportMessage, privateKey: CryptoKey, role: 'owner'|'team') {
  const wrapped = unb64(role === 'owner' ? message.ownerKey : message.teamKey);
  const secret = await crypto.subtle.decrypt({name:'RSA-OAEP'},privateKey,wrapped as BufferSource);
  const aes = await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['decrypt']);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(message.iv) as BufferSource},aes,unb64(message.ciphertext) as BufferSource);
  return decoder.decode(plain);
}
