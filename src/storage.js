import { decryptJson, encryptJson } from './crypto.js';

const VAULT_META_KEY = 'diary.vault.meta';
const VAULT_DATA_KEY = 'diary.vault.data';
const UI_PREFS_KEY = 'diary.ui.prefs';
const AUTH_KEY = 'diary.auth';
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

// (All media blobs are now stored encrypted on the server; no IndexedDB.)

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
