import { decryptJson, encryptJson } from './crypto.js';

const VAULT_META_KEY = 'diary.vault.meta';
const VAULT_DATA_KEY = 'diary.vault.data';
const UI_PREFS_KEY = 'diary.ui.prefs';
const AUTH_KEY = 'diary.auth';
const IDB_NAME = 'diary-blobs';
const IDB_VERSION = 1;
const IDB_STORE_VIDEOS = 'videos';
const IDB_STORE_VOICE = 'voice-memos';

// In-memory mirrors for vault meta, encrypted vault payloads, UI prefs and auth
// session. These avoid any persistent browser storage while still allowing the
// UI to function within a single page load.
const memoryVaultMeta = new Map();
const memoryVaultData = new Map();
let memoryUiPrefs = null;
let memoryAuth = null;
let seededFromLocal = false;

function seedFromLocalStorageOnce() {
  if (seededFromLocal) return;
  seededFromLocal = true;
  if (typeof localStorage === 'undefined') return;
  try {
    for (const slot of ['primary', 'decoy']) {
      const metaKey = keyForSlot(VAULT_META_KEY, slot);
      const metaRaw = localStorage.getItem(metaKey);
      if (metaRaw) {
        try {
          memoryVaultMeta.set(slot, JSON.parse(metaRaw));
        } catch {
          // ignore parse errors
        }
        localStorage.removeItem(metaKey);
      }

      const dataKey = keyForSlot(VAULT_DATA_KEY, slot);
      const dataRaw = localStorage.getItem(dataKey);
      if (dataRaw) {
        try {
          memoryVaultData.set(slot, JSON.parse(dataRaw));
        } catch {
          // ignore parse errors
        }
        localStorage.removeItem(dataKey);
      }
    }

    const uiRaw = localStorage.getItem(UI_PREFS_KEY);
    if (uiRaw) {
      try {
        memoryUiPrefs = JSON.parse(uiRaw);
      } catch {
        // ignore parse errors
      }
      localStorage.removeItem(UI_PREFS_KEY);
    }

    const authRaw = localStorage.getItem(AUTH_KEY);
    if (authRaw) {
      try {
        memoryAuth = JSON.parse(authRaw);
      } catch {
        // ignore parse errors
      }
      localStorage.removeItem(AUTH_KEY);
    }
  } catch {
    // If localStorage is unavailable or throws, treat as empty and do not
    // persist anything.
  }
}

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
  seedFromLocalStorageOnce();
  return memoryVaultMeta.get(slot) || null;
}

export function saveVaultMeta(meta, slot = 'primary') {
  seedFromLocalStorageOnce();
  memoryVaultMeta.set(slot, meta);
}

export function loadEncryptedVault(slot = 'primary') {
  seedFromLocalStorageOnce();
  return memoryVaultData.get(slot) || null;
}

export function saveEncryptedVault(payload, slot = 'primary') {
  seedFromLocalStorageOnce();
  memoryVaultData.set(slot, payload);
}

export function loadUiPrefs() {
  seedFromLocalStorageOnce();
  return memoryUiPrefs || null;
}

export function saveUiPrefs(prefs) {
  seedFromLocalStorageOnce();
  memoryUiPrefs = prefs;
}

export function loadAuthSession() {
  seedFromLocalStorageOnce();
  return memoryAuth || null;
}

export function saveAuthSession(auth) {
  seedFromLocalStorageOnce();
  if (!auth) {
    memoryAuth = null;
    return;
  }
  memoryAuth = auth;
}

export function clearAuthSession() {
  seedFromLocalStorageOnce();
  memoryAuth = null;
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
  // Legacy inline media blobs (voice/video) are now migrated to the server
  // on-demand from the UI layer; no browser storage (IndexedDB) is touched here.
  return vault;
}

export function encryptVault(vault, key) {
  return encryptJson(vault, key);
}

export function wipeAllData() {
  memoryVaultMeta.clear();
  memoryVaultData.clear();
  memoryUiPrefs = null;
  memoryAuth = null;
  if (typeof localStorage !== 'undefined') {
    for (const slot of ['primary', 'decoy']) {
      localStorage.removeItem(keyForSlot(VAULT_META_KEY, slot));
      localStorage.removeItem(keyForSlot(VAULT_DATA_KEY, slot));
    }
    localStorage.removeItem(UI_PREFS_KEY);
    localStorage.removeItem(AUTH_KEY);
  }
}

export function safeMemzeroKey(key) {
  if (!key) return;
  try {
    if (key instanceof Uint8Array) key.fill(0);
  } catch {
    // ignore
  }
}
