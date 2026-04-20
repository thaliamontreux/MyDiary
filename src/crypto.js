import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import { argon2id } from 'hash-wasm';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function ensureSodiumReady() {
  return;
}

export function createNewVaultSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

export function createNewEntryId() {
  const id = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(id);
}

export function isoDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function deriveVaultKey(password, saltB64) {
  const salt = base64ToBytes(saltB64);
  const keyHex = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64,
    hashLength: 32,
    outputType: 'hex'
  });
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    key[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
  }
  return key;
}

export function encryptJson(obj, key) {
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(obj));
  const aead = new XChaCha20Poly1305(key);
  const aad = new Uint8Array(0);
  const ciphertext = aead.seal(nonce, plaintext, aad);
  return {
    v: 1,
    alg: 'xchacha20poly1305',
    nonce: bytesToBase64(nonce),
    ct: bytesToBase64(ciphertext)
  };
}

export function decryptJson(payload, key) {
  if (!payload || payload.v !== 1 || payload.alg !== 'xchacha20poly1305') {
    throw new Error('Unsupported vault format');
  }
  const nonce = base64ToBytes(payload.nonce);
  const ct = base64ToBytes(payload.ct);
  const aead = new XChaCha20Poly1305(key);
  const aad = new Uint8Array(0);
  const plaintext = aead.open(nonce, ct, aad);
  if (!plaintext) throw new Error('Decryption failed');
  const json = TEXT_DECODER.decode(plaintext);
  return JSON.parse(json);
}
