import { decryptJson, encryptJson } from './crypto.js';

const VAULT_META_KEY = 'diary.vault.meta';
const VAULT_DATA_KEY = 'diary.vault.data';
const UI_PREFS_KEY = 'diary.ui.prefs';
const AUTH_KEY = 'diary.auth';
const IDB_NAME = 'diary-blobs';
const IDB_VERSION = 1;
const IDB_STORE_VIDEOS = 'videos';
const IDB_STORE_VOICE = 'voice-memos';

function keyForSlot(baseKey, slot = 'primary') {
  return slot === 'primary' ? baseKey : `${baseKey}.${slot}`;
}

// ── IndexedDB helpers for large blob storage (avoids localStorage 5-10MB limit) ──

function openBlobDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE_VIDEOS)) {
        db.createObjectStore(IDB_STORE_VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_VOICE)) {
        db.createObjectStore(IDB_STORE_VOICE, { keyPath: 'id' });
      }
    };
  });
}

export async function saveVideoBlob(id, dataUrl) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_VIDEOS);
    const req = store.put({ id, dataUrl, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getVideoBlob(id) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VIDEOS, 'readonly');
    const store = tx.objectStore(IDB_STORE_VIDEOS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.dataUrl || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVideoBlob(id) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(IDB_STORE_VIDEOS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveVoiceBlob(id, dataUrl) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VOICE, 'readwrite');
    const store = tx.objectStore(IDB_STORE_VOICE);
    const req = store.put({ id, dataUrl, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getVoiceBlob(id) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VOICE, 'readonly');
    const store = tx.objectStore(IDB_STORE_VOICE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.dataUrl || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVoiceBlob(id) {
  const db = await openBlobDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_VOICE, 'readwrite');
    const store = tx.objectStore(IDB_STORE_VOICE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Migration: Move inline data URLs from vault entries to IndexedDB ──────────

export async function migrateInlineBlobsToIndexedDB(vault) {
  if (!vault || !Array.isArray(vault.entries)) return vault;
  let migrated = false;

  for (const entry of vault.entries) {
    // Migrate videoClips
    if (Array.isArray(entry.videoClips)) {
      for (const clip of entry.videoClips) {
        if (clip.dataUrl && !clip.blobId) {
          // Old format: inline dataUrl — move to IndexedDB
          const blobId = clip.id || `vc-m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          try {
            await saveVideoBlob(blobId, clip.dataUrl);
            clip.blobId = blobId;
            delete clip.dataUrl; // Remove from vault to save space
            migrated = true;
          } catch (e) {
            console.error('[Migrate] Failed to move video clip to IDB', e);
          }
        }
      }
    }

    // Migrate voiceMemos
    if (Array.isArray(entry.voiceMemos)) {
      for (const memo of entry.voiceMemos) {
        if (memo.dataUrl && !memo.blobId) {
          const blobId = memo.id || `vm-m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          try {
            await saveVoiceBlob(blobId, memo.dataUrl);
            memo.blobId = blobId;
            delete memo.dataUrl;
            migrated = true;
          } catch (e) {
            console.error('[Migrate] Failed to move voice memo to IDB', e);
          }
        }
      }
    }
  }

  if (migrated) {
    console.log('[Migrate] Moved inline blobs to IndexedDB');
  }
  return vault;
}

export function loadVaultMeta(slot = 'primary') {
  const raw = localStorage.getItem(keyForSlot(VAULT_META_KEY, slot));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveVaultMeta(meta, slot = 'primary') {
  localStorage.setItem(keyForSlot(VAULT_META_KEY, slot), JSON.stringify(meta));
}

export function loadEncryptedVault(slot = 'primary') {
  const raw = localStorage.getItem(keyForSlot(VAULT_DATA_KEY, slot));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveEncryptedVault(payload, slot = 'primary') {
  localStorage.setItem(keyForSlot(VAULT_DATA_KEY, slot), JSON.stringify(payload));
}

export function loadUiPrefs() {
  const raw = localStorage.getItem(UI_PREFS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveUiPrefs(prefs) {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
}

export function loadAuthSession() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAuthSession(auth) {
  if (!auth) {
    localStorage.removeItem(AUTH_KEY);
    return;
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_KEY);
}

export function createEmptyVault() {
  return {
    entries: [],
    trash: []
  };
}

export async function decryptVaultOrThrow(encryptedPayload, key) {
  if (!encryptedPayload) return createEmptyVault();
  const vault = decryptJson(encryptedPayload, key);
  if (!vault || !Array.isArray(vault.entries)) return createEmptyVault();
  // Migrate any old inline blobs to IndexedDB
  await migrateInlineBlobsToIndexedDB(vault);
  return vault;
}

export function encryptVault(vault, key) {
  return encryptJson(vault, key);
}

export function wipeAllData() {
  for (const slot of ['primary', 'decoy']) {
    localStorage.removeItem(keyForSlot(VAULT_META_KEY, slot));
    localStorage.removeItem(keyForSlot(VAULT_DATA_KEY, slot));
  }
  localStorage.removeItem(UI_PREFS_KEY);
  localStorage.removeItem(AUTH_KEY);
}

export function safeMemzeroKey(key) {
  if (!key) return;
  try {
    if (key instanceof Uint8Array) key.fill(0);
  } catch {
    // ignore
  }
}
