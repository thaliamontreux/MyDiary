import { decryptJson, encryptJson } from './crypto.js';

const VAULT_META_KEY = 'diary.vault.meta';
const VAULT_DATA_KEY = 'diary.vault.data';
const UI_PREFS_KEY = 'diary.ui.prefs';
const AUTH_KEY = 'diary.auth';

function keyForSlot(baseKey, slot = 'primary') {
  return slot === 'primary' ? baseKey : `${baseKey}.${slot}`;
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

export function decryptVaultOrThrow(encryptedPayload, key) {
  if (!encryptedPayload) return createEmptyVault();
  const vault = decryptJson(encryptedPayload, key);
  if (!vault || !Array.isArray(vault.entries)) return createEmptyVault();
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
