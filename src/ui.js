import {
  createNewEntryId,
  createNewVaultSalt,
  deriveVaultKey,
  ensureSodiumReady,
  isoDate
} from './crypto.js';
import {
  createEmptyVault,
  decryptVaultOrThrow,
  encryptVault,
  loadEncryptedVault,
  loadUiPrefs,
  loadVaultMeta,
  saveEncryptedVault,
  saveUiPrefs,
  saveVaultMeta,
  safeMemzeroKey,
  wipeAllData,
  loadAuthSession,
  saveAuthSession,
  clearAuthSession
} from './storage.js';
import {
  loadVaultFromServer,
  loginUser,
  registerUser,
  saveVaultToServer,
  acceptTerms,
  deleteAccount,
  setUsername,
  changePassword,
  adminListUsers,
  adminSetUserAdmin,
  adminDeleteUser,
  adminGetSiteSummary,
  adminGetUser,
  adminUpdateUser,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  verifyFolderPassword,
  listVaults,
  createVault,
  updateVault,
  deleteVault,
  verifyVaultPassword,
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getEntryTags,
  addTagToEntry,
  removeTagFromEntry,
  getEntriesByTag,
  getAuditLogs,
  get2faStatus,
  setup2fa,
  saveRecoveryCodes,
  getRecoveryStatus,
  updateProfile
} from './api.js';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function svgDataUri(markup) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`;
}

function formatPrettyDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function nowTime() {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function sortEntriesDesc(entries) {
  return [...entries].sort((a, b) => {
    const da = (a.date || '') + ' ' + (a.createdAt || '');
    const db = (b.date || '') + ' ' + (b.createdAt || '');
    return db.localeCompare(da);
  });
}

const ENTRY_TYPE_OPTIONS = [
  ['journal', 'Journal'],
  ['quick', 'Quick thought'],
  ['gratitude', 'Gratitude'],
  ['dream', 'Dream log'],
  ['vent', 'Venting']
];

const MODULE_OPTIONS = [
  ['all', 'Everything'],
  ['diary', 'Diary'],
  ['note', 'Notes'],
  ['letter', 'Letters'],
  ['recipe', 'Recipes']
];

const LETTER_KIND_OPTIONS = [
  ['unsent', 'Unsent'],
  ['sent', 'Sent'],
  ['future-self', 'Future self']
];

const SVG_ART_LIBRARY = [
  {
    id: 'bow',
    label: 'Satin bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M47 44c-10-20-34-20-34 0 0 11 9 18 22 18-8 6-9 18 0 21 11 4 18-8 23-20 5 12 12 24 23 20 9-3 8-15 0-21 13 0 22-7 22-18 0-20-24-20-34 0l-11 10-11-10z" fill="#ff7fcf"/><circle cx="48" cy="48" r="10" fill="#ffd9ef"/></svg>`)
  },
  {
    id: 'heart',
    label: 'Candy heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 82 20 56C8 44 9 25 24 18c9-4 18-1 24 8 6-9 15-12 24-8 15 7 16 26 4 38L48 82z" fill="#ff6ea8"/><path d="M48 72 27 52c-7-7-7-19 3-24 7-3 13-1 18 7 5-8 11-10 18-7 10 5 10 17 3 24L48 72z" fill="#ffd7e9"/></svg>`)
  },
  {
    id: 'moon',
    label: 'Pearl moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M61 12c-20 4-35 22-35 44 0 13 6 24 16 32-21-1-38-18-38-40 0-24 19-43 43-43 5 0 10 1 14 3z" fill="#f7e8ff"/><circle cx="62" cy="28" r="5" fill="#ffe388"/><circle cx="72" cy="44" r="3" fill="#ffe388"/></svg>`)
  },
  {
    id: 'butterfly',
    label: 'Butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M46 47c-12-20-31-22-35-8-3 11 5 23 20 24-8 5-10 15-2 20 8 5 18-1 23-12l3-8-9-16z" fill="#ff97d6"/><path d="M50 47c12-20 31-22 35-8 3 11-5 23-20 24 8 5 10 15 2 20-8 5-18-1-23-12l-3-8 9-16z" fill="#b88cff"/><rect x="45" y="28" width="6" height="40" rx="3" fill="#5d3059"/></svg>`)
  },
  {
    id: 'tiara',
    label: 'Tiara',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M14 63 26 31l21 20 20-27 15 39H14z" fill="#ffd86f"/><path d="M18 67h60" stroke="#fff3bf" stroke-width="8" stroke-linecap="round"/><circle cx="26" cy="32" r="5" fill="#fff4dd"/><circle cx="47" cy="50" r="6" fill="#fff4dd"/><circle cx="67" cy="25" r="5" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'rose',
    label: 'Rose bloom',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 21c8-9 24-5 26 8 9 3 13 17 4 24 4 13-8 24-21 21-8 10-24 8-29-5-12-1-20-14-14-25-3-11 7-22 19-20 2-9 9-13 15-13z" fill="#ff7bab"/><path d="M48 34c11 0 19 8 19 18s-8 18-19 18-19-8-19-18 8-18 19-18z" fill="#ffd9e8"/><path d="M49 69c-3 8-4 12-4 17" stroke="#6fc178" stroke-width="5" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'tea',
    label: 'Tea cup',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M19 40h46v12c0 11-9 20-20 20H39c-11 0-20-9-20-20V40z" fill="#ffe8f3"/><path d="M65 44h8c8 0 12 5 12 11s-4 11-12 11h-7" fill="none" stroke="#ffd2ea" stroke-width="7" stroke-linecap="round"/><path d="M26 78h41" stroke="#ff9dcc" stroke-width="6" stroke-linecap="round"/><path d="M34 20c0 7-6 7-6 14M48 18c0 7-6 7-6 14M61 20c0 7-6 7-6 14" stroke="#fff4f9" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'cloud',
    label: 'Cloud puff',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M29 71c-11 0-20-8-20-18 0-9 7-17 17-18 3-13 15-22 29-22 12 0 23 7 28 17 10 0 18 8 18 18s-9 18-21 18H29z" fill="#f5f8ff"/><circle cx="34" cy="69" r="4" fill="#ffd7ef"/><circle cx="49" cy="74" r="3" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'gem',
    label: 'Crystal gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 34 40 17h16l16 17-24 45-24-45z" fill="#8fdfff"/><path d="M24 34h48" stroke="#dff8ff" stroke-width="5"/><path d="m40 17 8 62 8-62" stroke="#dff8ff" stroke-width="4"/></svg>`)
  },
  {
    id: 'lipstick',
    label: 'Lipstick',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M36 20h24v20L48 54 36 40V20z" fill="#ff5d8f"/><path d="M32 40h32v16H32z" fill="#2b203d"/><path d="M34 56h28v20H34z" fill="#c7bedb"/></svg>`)
  },
  {
    id: 'frame',
    label: 'Ribbon frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="16" y="18" width="64" height="58" rx="14" fill="none" stroke="#ffd7ef" stroke-width="8" stroke-dasharray="2 8"/><path d="M18 24c10 0 13-12 22-12 8 0 10 10 8 16-10 2-18 2-30-4z" fill="#ff8fd6"/><path d="M78 24c-10 0-13-12-22-12-8 0-10 10-8 16 10 2 18 2 30-4z" fill="#b58bff"/></svg>`)
  },
  {
    id: 'flower1',
    label: 'Daisy',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="12" fill="#ffeaa7"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(0 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(45 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(90 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(135 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(180 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(225 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(270 48 48)"/><ellipse cx="48" cy="28" rx="10" ry="18" fill="#fff" transform="rotate(315 48 48)"/></svg>`)
  },
  {
    id: 'flower2',
    label: 'Cherry blossom',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-8 0-14 8-14 18 0 6 4 12 10 14-2 6-2 14 0 20 6 2 12 0 16-4 4 4 10 6 16 4 2-6 2-14 0-20 6-2 10-8 10-14 0-10-6-18-14-18-8 0-14 8-14 18 0 6 4 12 10 14-2 6-2 14 0 20 6 2 12 0 16-4 4 4 10 6 16 4 2-6 2-14 0-20 6-2 10-8 10-14 0-10-6-18-14-18z" fill="#ffb7c5"/><circle cx="48" cy="48" r="6" fill="#ffd9e8"/></svg>`)
  },
  {
    id: 'star',
    label: 'Sparkle star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 12 56 38 84 38 62 54 70 82 48 64 26 82 34 54 12 38 40 38z" fill="#ffd86f"/><path d="M48 20 53 38 72 38 58 50 63 68 48 56 33 68 38 50 24 38 43 38z" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'sparkle',
    label: 'Diamond sparkle',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 12 54 42 86 48 54 54 48 86 42 54 10 48 42 42z" fill="#b8e3ff"/><path d="M48 20 51 42 74 48 51 54 48 76 45 54 22 48 45 42z" fill="#e6f7ff"/></svg>`)
  },
  {
    id: 'ribbon',
    label: 'Flowing ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 48c8-8 24-8 32 0 8-8 24-8 32 0 8-8 24-8 32 0" fill="none" stroke="#ff9eb5" stroke-width="8" stroke-linecap="round"/><path d="M16 48c8-8 24-8 32 0 8-8 24-8 32 0 8-8 24-8 32 0" fill="none" stroke="#ffd7ef" stroke-width="4" stroke-linecap="round" transform="translate(4,4)"/></svg>`)
  },
  {
    id: 'crown',
    label: 'Princess crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 64h56l8-24-14 8-12-20-10 20-12-20-12 20-14-8z" fill="#ffd86f"/><path d="M20 68h56" stroke="#fff3bf" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="48" r="4" fill="#fff4dd"/><circle cx="42" cy="36" r="5" fill="#fff4dd"/><circle cx="48" cy="28" r="6" fill="#fff4dd"/><circle cx="54" cy="36" r="5" fill="#fff4dd"/><circle cx="68" cy="48" r="4" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'wand',
    label: 'Magic wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 72 72 24" stroke="#ffd86f" stroke-width="8" stroke-linecap="round"/><circle cx="24" cy="72" r="8" fill="#ff9eb5"/><circle cx="72" cy="24" r="8" fill="#b8e3ff"/><circle cx="32" cy="64" r="4" fill="#ffd7ef"/><circle cx="64" cy="32" r="4" fill="#e6f7ff"/></svg>`)
  },
  {
    id: 'key',
    label: 'Heart key',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-16 0-28 12-28 28 0 10 6 18 14 22l-8 16h16l4-8 4 8h16l-8-16c8-4 14-12 14-22 0-16-12-28-28-28z" fill="#ffd86f"/><circle cx="48" cy="48" r="10" fill="#ff6ea8"/></svg>`)
  },
  {
    id: 'lock',
    label: 'Heart lock',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M32 38v-8c0-10 8-16 16-16s16 6 16 16v8h8v42H24V38h8zm12-8v8h8v-8c0-2-2-4-4-4s-4 2-4 4z" fill="#ffd86f"/><rect x="24" y="38" width="48" height="42" rx="4" fill="#ff9eb5"/><circle cx="48" cy="60" r="8" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'candy',
    label: 'Lollipop',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="32" r="20" fill="#ff6ea8"/><circle cx="48" cy="32" r="16" fill="#ffd7e9"/><path d="M48 52v36" stroke="#ffd86f" stroke-width="6" stroke-linecap="round"/><path d="M38 24c2-2 6-2 8 0 2-2 6-2 8 0 2-2 6-2 8 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M40 32c2 2 6 2 8 0 2 2 6 2 8 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon',
    label: 'Heart balloon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16c-14 0-24 12-24 26 0 10 6 18 12 22v14h24v-14c6-4 12-12 12-22 0-14-10-26-24-26z" fill="#ff6ea8"/><path d="M48 24c-8 0-16 6-16 18 0 6 4 12 8 14v10h16v-10c4-2 8-8 8-14 0-12-8-18-16-18z" fill="#ffd7e9"/><path d="M48 68v16" stroke="#ff9eb5" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell',
    label: 'Jingle bell',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16c-14 0-24 10-24 24v24h48v-24c0-14-10-24-24-24z" fill="#ffd86f"/><circle cx="48" cy="64" r="12" fill="#ff9eb5"/><circle cx="48" cy="64" r="8" fill="#ffd7ef"/><path d="M48 8v8" stroke="#ffd86f" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="8" r="4" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'shoe',
    label: 'Glass slipper',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 60c0-8 8-16 20-16 12 0 24 8 32 16 8-4 16-4 20 0 4 4 0 12-4 16-4 4-12 4-20 0-8 8-20 16-32 16-12 0-20-8-20-16z" fill="#b8e3ff"/><path d="M20 60c0-8 8-16 20-16 12 0 24 8 32 16" fill="none" stroke="#e6f7ff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'purse',
    label: 'Clutch purse',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 40h40v36H28z" fill="#ff9eb5"/><path d="M32 36c0-10 8-16 16-16s16 6 16 16" fill="none" stroke="#ffd86f" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="58" r="6" fill="#ffd7ef"/><circle cx="48" cy="58" r="3" fill="#fff"/></svg>`)
  },
  {
    id: 'perfume',
    label: 'Perfume bottle',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="36" y="20" width="24" height="12" rx="2" fill="#ffd86f"/><rect x="32" y="32" width="32" height="40" rx="4" fill="#b8e3ff"/><rect x="36" y="36" width="24" height="32" rx="2" fill="#e6f7ff"/><circle cx="48" cy="52" r="4" fill="#ff9eb5"/><circle cx="48" cy="64" r="4" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'mirror',
    label: 'Hand mirror',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="36" rx="24" ry="28" fill="#b8e3ff"/><ellipse cx="48" cy="36" rx="20" ry="24" fill="#e6f7ff"/><path d="M48 64v20" stroke="#ffd86f" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="84" r="6" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'brush',
    label: 'Makeup brush',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="40" y="40" width="16" height="36" rx="2" fill="#ffd86f"/><path d="M32 40c8-8 16-8 24 0 8-8 16-8 24 0" fill="#ff9eb5"/><path d="M36 40c6-4 12-4 18 0 6-4 12-4 18 0" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'starburst',
    label: 'Starburst',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8 52 32 76 28 60 48 76 68 52 64 48 88 44 64 20 68 36 48 20 28 44 32z" fill="#ffd86f"/><path d="M48 16 50 32 66 30 54 48 66 66 50 64 48 80 46 64 30 66 42 48 30 30 46 32z" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'flower3',
    label: 'Tulip',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M32 48c0-16 8-24 16-24s16 8 16 24c0 8-4 16-8 20v12h-16v-12c-4-4-8-12-8-20z" fill="#ff6ea8"/><path d="M40 48c0-8 4-12 8-12s8 4 8 12" fill="none" stroke="#ffd7e9" stroke-width="3"/><path d="M48 68v20" stroke="#6fc178" stroke-width="5" stroke-linecap="round"/><path d="M40 80c4-4 8-4 12 0 4-4 8-4 12 0" fill="#6fc178"/></svg>`)
  },
  {
    id: 'flower4',
    label: 'Sunflower',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="16" fill="#ffd86f"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(0 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(30 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(60 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(90 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(120 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(150 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(180 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(210 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(240 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(270 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(300 48 48)"/><ellipse cx="48" cy="24" rx="6" ry="16" fill="#ffd86f" transform="rotate(330 48 48)"/><circle cx="48" cy="48" r="8" fill="#8b4513"/></svg>`)
  },
  {
    id: 'heart2',
    label: 'Sparkle heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 82 20 56C8 44 9 25 24 18c9-4 18-1 24 8 6-9 15-12 24-8 15 7 16 26 4 38L48 82z" fill="#ff6ea8"/><path d="M48 72 27 52c-7-7-7-19 3-24 7-3 13-1 18 7 5-8 11-10 18-7 10 5 10 17 3 24L48 72z" fill="#ffd7e9"/><circle cx="32" cy="36" r="3" fill="#fff"/><circle cx="64" cy="36" r="3" fill="#fff"/><circle cx="48" cy="52" r="3" fill="#fff"/></svg>`)
  },
  {
    id: 'star2',
    label: 'Twinkle star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16 52 36 72 32 60 48 72 64 52 60 48 80 44 60 24 64 36 48 24 32 44 36z" fill="#b8e3ff"/><path d="M48 24 50 36 64 34 54 48 64 62 50 60 48 72 46 60 32 62 42 48 32 34 46 36z" fill="#e6f7ff"/></svg>`)
  },
  {
    id: 'moon2',
    label: 'Crescent moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16c-18 0-32 16-32 36s14 36 32 36c-8-8-12-20-12-36s4-28 12-36z" fill="#f7e8ff"/><circle cx="64" cy="28" r="4" fill="#ffe388"/><circle cx="72" cy="44" r="3" fill="#ffe388"/><circle cx="60" cy="64" r="2" fill="#ffe388"/></svg>`)
  },
  {
    id: 'butterfly2',
    label: 'Fairy butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 28c-8-12-20-12-24 0-2 8 4 16 12 16-4 4-4 10 0 12 4 2 8-2 12-8l0-20z" fill="#ffb7c5"/><path d="M48 28c8-12 20-12 24 0 2 8-4 16-12 16 4 4 4 10 0 12-4 2-8-2-12-8l0-20z" fill="#e6b3ff"/><rect x="46" y="28" width="4" height="32" rx="2" fill="#5d3059"/></svg>`)
  },
  {
    id: 'bow2',
    label: 'Gift bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 40c-12-16-28-16-28 0 0 8 6 14 16 14-6 4-6 12 0 14 8 4 14-4 18-12 4 8 10 12 18 12 6-2 6-10 0-14 10 0 16-6 16-14 0-16-16-16-28 0l-11 7-11-7z" fill="#ff6ea8"/><circle cx="48" cy="48" r="8" fill="#ffd7e9"/></svg>`)
  },
  {
    id: 'crown2',
    label: 'Royal crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 60h64l6-20-12 6-10-16-8 16-10-16-10 16-12-6z" fill="#ffd86f"/><path d="M16 64h64" stroke="#fff3bf" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="48" r="4" fill="#fff4dd"/><circle cx="38" cy="38" r="5" fill="#fff4dd"/><circle cx="48" cy="30" r="6" fill="#fff4dd"/><circle cx="58" cy="38" r="5" fill="#fff4dd"/><circle cx="72" cy="48" r="4" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'wand2',
    label: 'Fairy wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 76 76 20" stroke="#ffd86f" stroke-width="6" stroke-linecap="round"/><circle cx="20" cy="76" r="6" fill="#ff9eb5"/><circle cx="76" cy="20" r="6" fill="#b8e3ff"/><circle cx="28" cy="68" r="3" fill="#ffd7ef"/><circle cx="68" cy="28" r="3" fill="#e6f7ff"/><circle cx="48" cy="48" r="2" fill="#fff"/></svg>`)
  },
  {
    id: 'gem2',
    label: 'Ruby gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 36 40 22h16l12 14-20 36-20-36z" fill="#ff6ea8"/><path d="M28 36h40" stroke="#ffd7e9" stroke-width="4"/><path d="m40 22 8 36 8-36" stroke="#ffd7e9" stroke-width="3"/></svg>`)
  },
  {
    id: 'sparkle2',
    label: 'Cross sparkle',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8v80M8 48h80" stroke="#ffd86f" stroke-width="4" stroke-linecap="round"/><circle cx="48" cy="48" r="8" fill="#fff4dd"/><circle cx="48" cy="48" r="4" fill="#ffd86f"/></svg>`)
  },
  {
    id: 'ribbon2',
    label: 'Curly ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 56c12-12 24-12 36 0 12-12 24-12 36 0" fill="none" stroke="#ff9eb5" stroke-width="6" stroke-linecap="round"/><path d="M20 56c10-8 20-8 28 0 8-8 20-8 28 0" fill="none" stroke="#ffd7ef" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'frame2',
    label: 'Dotted frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="16" y="16" width="64" height="64" rx="16" fill="none" stroke="#ffd7ef" stroke-width="6" stroke-dasharray="4 8"/><circle cx="20" cy="20" r="4" fill="#ff9eb5"/><circle cx="76" cy="20" r="4" fill="#b58bff"/><circle cx="20" cy="76" r="4" fill="#b58bff"/><circle cx="76" cy="76" r="4" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'cloud2',
    label: 'Rainbow cloud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 68c-12 0-20-8-20-18 0-8 6-16 16-18 4-12 14-20 28-20 10 0 20 6 24 16 8 0 16 8 16 18s-8 18-20 18H28z" fill="#f5f8ff"/><circle cx="32" cy="64" r="4" fill="#ff9eb5"/><circle cx="44" cy="68" r="4" fill="#ffd86f"/><circle cx="56" cy="68" r="4" fill="#98fb98"/><circle cx="68" cy="64" r="4" fill="#b8e3ff"/></svg>`)
  },
  {
    id: 'tea2',
    label: 'Teacup',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 44h48v16c0 12-10 22-24 22s-24-10-24-22v-16z" fill="#ffe8f3"/><path d="M72 48h8c8 0 12 6 12 14s-4 14-12 14h-6" fill="none" stroke="#ffd2ea" stroke-width="6" stroke-linecap="round"/><path d="M32 76h32" stroke="#ff9dcc" stroke-width="5" stroke-linecap="round"/><path d="M36 28c0 8-8 8-8 16M48 26c0 8-8 8-8 16M60 28c0 8-8 8-8 16" stroke="#fff4f9" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'lipstick2',
    label: 'Lipstick tube',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="36" y="20h24v24l-12 16-12-16v-24z" fill="#ff5d8f"/><rect x="32" y="44h32v20H32z" fill="#2b203d"/><rect x="36" y="64h24v16H36z" fill="#c7bedb"/></svg>`)
  },
  {
    id: 'perfume2',
    label: 'Perfume',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="38" y="18h20v10h-20z" fill="#ffd86f"/><rect x="34" y="28h28v44h-28z" fill="#b8e3ff"/><rect x="38" y="32h20v36h-20z" fill="#e6f7ff"/><circle cx="48" cy="48" r="5" fill="#ff9eb5"/><circle cx="48" cy="60" r="5" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'mirror2',
    label: 'Mirror',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="38" rx="26" ry="30" fill="#b8e3ff"/><ellipse cx="48" cy="38" rx="22" ry="26" fill="#e6f7ff"/><path d="M48 68v18" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="86" r="5" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'brush2',
    label: 'Brush',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="42" y="40h12v32h-12z" fill="#ffd86f"/><path d="M36 40c6-6 12-6 18 0 6-6 12-6 18 0" fill="#ff9eb5"/><path d="M40 40c5-4 10-4 15 0 5-4 10-4 15 0" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'purse2',
    label: 'Handbag',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 44h40v32H28z" fill="#ff9eb5"/><path d="M32 40c0-12 8-16 16-16s16 4 16 16" fill="none" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="60" r="5" fill="#ffd7ef"/><circle cx="48" cy="60" r="2" fill="#fff"/></svg>`)
  },
  {
    id: 'shoe2',
    label: 'Ballet shoe',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 62c0-10 10-16 20-16 12 0 24 8 32 16 6-4 14-4 18 0 4 4 0 10-4 14-4 4-10 4-18 0-8 8-20 16-32 16-12 0-20-8-20-16z" fill="#b8e3ff"/><path d="M24 62c0-10 10-16 20-16 12 0 24 8 32 16" fill="none" stroke="#e6f7ff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell2',
    label: 'Bell',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-12 0-20 10-20 20v20h40v-20c0-12-8-20-20-20z" fill="#ffd86f"/><circle cx="48" cy="60" r="10" fill="#ff9eb5"/><circle cx="48" cy="60" r="6" fill="#ffd7ef"/><path d="M48 12v8" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="12" r="3" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'candy2',
    label: 'Candy',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="36" r="18" fill="#ff6ea8"/><circle cx="48" cy="36" r="14" fill="#ffd7e9"/><path d="M48 54v32" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><path d="M36 28c2-2 6-2 8 0 2-2 6-2 8 0 2-2 6-2 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M38 36c2 2 6 2 8 0 2 2 6 2 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon2',
    label: 'Balloon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-12 0-20 10-20 22 0 8 4 16 10 20v12h20v-12c6-4 10-12 10-22 0-12-8-22-20-22z" fill="#ff6ea8"/><path d="M48 28c-6 0-12 4-12 14 0 4 2 10 6 12v8h12v-8c4-2 6-8 6-12 0-10-6-14-12-14z" fill="#ffd7e9"/><path d="M48 72v12" stroke="#ff9eb5" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'key2',
    label: 'Key',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 24c-14 0-24 10-24 24 0 8 4 16 12 18l-6 12h12l3-6 3 6h12l-6-12c8-2 12-10 12-18 0-14-10-24-24-24z" fill="#ffd86f"/><circle cx="48" cy="48" r="8" fill="#ff6ea8"/></svg>`)
  },
  {
    id: 'lock2',
    label: 'Lock',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M32 40v-6c0-8 6-14 16-14s16 6 16 14v6h6v38H26V40h6zm10-6v6h12v-6c0-2-2-3-6-3s-6 1-6 3z" fill="#ffd86f"/><rect x="26" y="40" width="44" height="38" rx="3" fill="#ff9eb5"/><circle cx="48" cy="58" r="6" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'flower5',
    label: 'Rose bud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-8 0-14 6-14 14 0 4 2 8 6 10-2 4-2 8 0 10 4 2 8-2 10-6 2 4 6 6 10 6 4 0 8-2 10-6 2 4 2 8 0 10-4 2-8 2-10 6-10 0-4-2-8-6-10 2-4 2-8 0-10-4-2-8-2-10-6-10-4 0-8 2-10 6-2-4-6-6-10-6-4 0-8 2-10 6-2-4-2-8 0-10 4-2 8-2 10 6 10 0 4 2 8 6 10-2 4-2 8 0 10 4 2 8 2 10 6 10z" fill="#ff7bab"/><circle cx="48" cy="44" r="8" fill="#ffd9e8"/></svg>`)
  },
  {
    id: 'flower6',
    label: 'Lily',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 24c-6 0-10 6-10 14 0 4 2 8 4 10-2 2-2 6 0 8 2 2 4 0 6-2 2 2 4 4 6 4 2 0 4-2 6-4 2 2 2 4 0 6-2 2-4 2-6 4-6 0-2-2-4-4-6 2-2 2-4 0-6-2-2-4-2-6-4-6-2 0-4 2-6 4-2-2-4-4-6-4-2 0-4 2-6 4-2-2-2-4 0-6 2-2 4-2 6 4 6 0 2 2 4 4 6-2 2-2 4 0 6 2 2 4 2 6 4 6z" fill="#ffb7c5"/><circle cx="48" cy="44" r="6" fill="#ffe4e1"/></svg>`)
  },
  {
    id: 'star3',
    label: 'Shooting star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 80 48 16l32 64H16z" fill="#ffd86f"/><path d="M24 72 48 28l24 44H24z" fill="#fff4dd"/><circle cx="48" cy="52" r="4" fill="#ffe388"/></svg>`)
  },
  {
    id: 'heart3',
    label: 'Double heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 82 20 56C8 44 9 25 24 18c9-4 18-1 24 8 6-9 15-12 24-8 15 7 16 26 4 38L48 82z" fill="#ff6ea8"/><path d="M48 72 27 52c-7-7-7-19 3-24 7-3 13-1 18 7 5-8 11-10 18-7 10 5 10 17 3 24L48 72z" fill="#ffd7e9"/><path d="M48 62 32 46c-5-5-5-12 2-16 4-2 8-1 12 3 3-4 7-5 12-3 7 4 7 10 2 14L48 62z" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'moon3',
    label: 'Sleepy moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M56 16c-16 4-28 20-28 40 0 12 6 22 14 30-16-1-30-16-30-36 0-20 16-36 36-36 4 0 8 1 12 2z" fill="#f7e8ff"/><circle cx="56" cy="24" r="4" fill="#ffe388"/><circle cx="64" cy="40" r="3" fill="#ffe388"/><circle cx="52" cy="56" r="2" fill="#ffe388"/><path d="M64 24c2 0 4 2 4 4s-2 4-4 4-4-2-4-4 2-4 4-4z" fill="#5d3059"/></svg>`)
  },
  {
    id: 'butterfly3',
    label: 'Monarch butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 44c-10-16-26-18-30-4-2 10 4 18 16 20-6 4-8 12-2 16 6 4 14-2 20-12l4-20z" fill="#ff6347"/><path d="M48 44c10-16 26-18 30-4 2 10-4 18-16 20 6 4 8 12 2 16-6 4-14-2-20-12l-4-20z" fill="#ff9f43"/><rect x="46" y="28" width="4" height="32" rx="2" fill="#2c3e50"/><circle cx="48" cy="32" r="2" fill="#fff"/><circle cx="48" cy="52" r="2" fill="#fff"/></svg>`)
  },
  {
    id: 'bow3',
    label: 'Hair bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 40c-8-14-24-14-24 0 0 6 6 12 16 12-4 4-4 10 0 12 6 4 12-4 16-12 4 6 10 12 16 12 4-2 4-8 0-12 10 0 16-6 16-12 0-14-16-14-24 0l-8 6-8-6z" fill="#ff7fcf"/><circle cx="48" cy="48" r="6" fill="#ffd9ef"/></svg>`)
  },
  {
    id: 'crown3',
    label: 'Mini crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 64h56l4-16-10 4-8-12-6 12-8-12-8 12-10-4z" fill="#ffd86f"/><path d="M20 68h56" stroke="#fff3bf" stroke-width="4" stroke-linecap="round"/><circle cx="26" cy="52" r="3" fill="#fff4dd"/><circle cx="38" cy="44" r="4" fill="#fff4dd"/><circle cx="48" cy="36" r="5" fill="#fff4dd"/><circle cx="58" cy="44" r="4" fill="#fff4dd"/><circle cx="70" cy="52" r="3" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'wand3',
    label: 'Star wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 72 72 24" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="72" r="5" fill="#ff9eb5"/><circle cx="72" cy="24" r="5" fill="#b8e3ff"/><circle cx="32" cy="64" r="2" fill="#ffd7ef"/><circle cx="64" cy="32" r="2" fill="#e6f7ff"/><path d="M48 48l2-2m-2 2l-2 2m2-2l2 2m-2-2l-2-2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'gem3',
    label: 'Emerald gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 36 42 24h12l12 12-18 32-18-32z" fill="#50c878"/><path d="M30 36h36" stroke="#90ee90" stroke-width="3"/><path d="m42 24 6 32 6-32" stroke="#90ee90" stroke-width="2"/></svg>`)
  },
  {
    id: 'sparkle3',
    label: 'Burst sparkle',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 12l4 20 20 4-20 4-4 20-4-20-20-4 20-4 4-20-4-20 4-4 20 4 20 4z" fill="#ffd86f"/><path d="M48 18l3 14 14 3-14 3-3 14-3-14-14-3 14-3 3-14-3-14 3-3 14 3 14 3z" fill="#fff4dd"/></svg>`)
  },
  {
    id: 'ribbon3',
    label: 'Wavy ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M12 52c14-10 28-10 42 0 14-10 28-10 42 0" fill="none" stroke="#ff9eb5" stroke-width="5" stroke-linecap="round"/><path d="M16 52c12-6 24-6 36 0 12-6 24-6 36 0" fill="none" stroke="#ffd7ef" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'frame3',
    label: 'Corner frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 16v20h20V16H16zm44 0v20h20V16H60zM16 60v20h20V60H16zm44 0v20h20V60H60z" fill="none" stroke="#ffd7ef" stroke-width="6"/><circle cx="26" cy="26" r="4" fill="#ff9eb5"/><circle cx="70" cy="26" r="4" fill="#b58bff"/><circle cx="26" cy="70" r="4" fill="#b58bff"/><circle cx="70" cy="70" r="4" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'cloud3',
    label: 'Fluffy cloud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M32 68c-14 0-24-10-24-22 0-10 8-18 18-20 4-14 16-24 30-24 12 0 22 8 28 20 10 0 18 10 18 22s-10 22-22 22H32z" fill="#f5f8ff"/><circle cx="36" cy="62" r="5" fill="#ffd7ef"/><circle cx="48" cy="68" r="5" fill="#ffd7ef"/><circle cx="60" cy="68" r="5" fill="#ffd7ef"/><circle cx="72" cy="62" r="5" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'tea3',
    label: 'Tea set',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 44h52v18c0 14-12 24-26 24s-26-10-26-24v-18z" fill="#ffe8f3"/><path d="M72 48h10c10 0 14 8 14 16s-4 16-14 16h-8" fill="none" stroke="#ffd2ea" stroke-width="6" stroke-linecap="round"/><path d="M28 82h36" stroke="#ff9dcc" stroke-width="5" stroke-linecap="round"/><path d="M32 24c0 10-10 10-10 20M48 22c0 10-10 10-10 20M64 24c0 10-10 10-10 20" stroke="#fff4f9" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'lipstick3',
    label: 'Lipstick compact',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="36" y="18h24v28l-12 20-12-20v-28z" fill="#ff5d8f"/><rect x="32" y="46h32v24H32z" fill="#2b203d"/><rect x="36" y="70h24v14H36z" fill="#c7bedb"/></svg>`)
  },
  {
    id: 'perfume3',
    label: 'Perfume atomizer',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="38" y= "16" width="20" height="12" rx="2" fill="#ffd86f"/><rect x="34" y="28h28v48h-28z" fill="#b8e3ff"/><rect x="38" y="32h20v40h-20z" fill="#e6f7ff"/><circle cx="48" cy="52" r="6" fill="#ff9eb5"/><circle cx="48" cy="66" r="6" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'mirror3',
    label: 'Vanity mirror',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="38" rx="28" ry="32" fill="#b8e3ff"/><ellipse cx="48" cy="38" rx="24" ry="28" fill="#e6f7ff"/><path d="M48 70v18" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="88" r="6" fill="#ff9eb5"/></svg>`)
  },
  {
    id: 'brush3',
    label: 'Powder brush',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="44" y="38h8v36h-8z" fill="#ffd86f"/><path d="M36 38c8-8 16-8 24 0 8-8 16-8 24 0" fill="#ff9eb5"/><path d="M40 38c6-5 12-5 18 0 6-5 12-5 18 0" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'purse3',
    label: 'Evening bag',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M26 44h44v36H26z" fill="#ff9eb5"/><path d="M30 38c0-14 10-18 18-18s18 4 18 18" fill="none" stroke="#ffd86f" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="62" r="6" fill="#ffd7ef"/><circle cx="48" cy="62" r="2" fill="#fff"/></svg>`)
  },
  {
    id: 'shoe3',
    label: 'Heel shoe',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M22 64c0-12 12-18 22-18 14 0 28 10 36 20 8-6 16-6 20 0 6 6 0 14-6 18-6 6-14 6-22 0-10 10-24 20-36 20-14 0-22-10-22-20z" fill="#b8e3ff"/><path d="M22 64c0-12 12-18 22-18 14 0 28 10 36 20" fill="none" stroke="#e6f7ff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell3',
    label: 'Silver bell',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 18c-14 0-24 12-24 26v22h48v-22c0-14-10-26-24-26z" fill="#c0c0c0"/><circle cx="48" cy="66" r="12" fill="#ff9eb5"/><circle cx="48" cy="66" r="8" fill="#ffd7ef"/><path d="M48 8v10" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="8" r="4" fill="#e0e0e0"/></svg>`)
  },
  {
    id: 'candy3',
    label: 'Candy cane',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M36 20c-10 0-18 8-18 18 0 6 4 12 10 14v32h8v-32c6-2 10-8 10-14 0-10-8-18-18-18z" fill="#ff6ea8"/><path d="M36 28c-6 0-10 4-10 10 0 3 2 6 4 8v24h4v-24c2-2 4-5 4-8 0-6-4-10-10-10z" fill="#ffd7e9"/><path d="M40 24v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M40 36v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M40 48v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon3',
    label: 'Party balloon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 18c-14 0-24 12-24 26 0 10 6 18 12 24v10h24v-10c6-6 12-14 12-24 0-14-10-26-24-26z" fill="#ff6ea8"/><path d="M48 26c-8 0-14 6-14 18 0 6 4 12 8 16v8h12v-8c4-4 8-10 8-16 0-12-6-18-14-18z" fill="#ffd7e9"/><path d="M48 78v10" stroke="#ff9eb5" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'key3',
    label: 'Skeleton key',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-16 0-28 12-28 28 0 10 6 18 14 22l-8 14h14l4-8 4 8h14l-8-14c8-4 14-12 14-22 0-16-12-28-28-28z" fill="#ffd86f"/><circle cx="48" cy="48" r="10" fill="#ff6ea8"/></svg>`)
  },
  {
    id: 'lock3',
    label: 'Heart lock',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 42v-8c0-10 8-16 18-16s18 6 18 16v8h8v42H22v-42h8zm12-8v8h12v-8c0-2-2-4-6-4s-6 2-6 4z" fill="#ffd86f"/><rect x="22" y="42" width="52" height="42" rx="4" fill="#ff9eb5"/><path d="M48 58c-4 0-8 4-8 8s4 8 8 8 8-4 8-8-4-8-8-8z" fill="#ffd7ef"/></svg>`)
  },
  {
    id: 'flower7',
    label: 'Poppy',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-10 0-18 8-18 18 0 8 6 14 14 16-4 6-4 14 0 18 6 4 14-4 18-16 4 6 6 14 0 18-4 6-14 4-18-16-4-6-14-6-18 0-8-6-14-14-16-4 6-14 6-18 0-8 6-14 14-16-4-6-14-6-18 0-8 6-14 14-16-4-6-14-6-18 0-8 6-14 14-16 4 6 14 6 18 0 8 6 14 14 16 4-6 14-6 18 0 8-6 14-14 16-4-6-14-6-18 0-8-6-14-14-16z" fill="#ff6347"/><circle cx="48" cy="48" r="10" fill="#ffd7e9"/></svg>`)
  },
  {
    id: 'flower8',
    label: 'Daffodil',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 28c-8 0-14 8-14 18 0 4 2 8 4 10-2 2-2 6 0 8 2 2 4 0 6-2 2 2 4 4 6 4 2 0 4-2 6-4 2 2 2 4 0 6-2 2-4 2-6 4-6 0-2-2-4-4-6 2-2 2-4 0-6-2-2-4-2-6-4-6-2 0-4 2-6 4-2-2-4-4-6-4-2 0-4 2-6 4-2-2-2-4 0-6 2-2 4-2 6 4 6 0 2 2 4 4 6-2 2-2 4 0 6 2 2 4 2 6 4 6z" fill="#ffd700"/><circle cx="48" cy="48" r="6" fill="#ff8c00"/><path d="M48 56v20" stroke="#6fc178" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'star4',
    label: 'Morning star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8 52 36 80 32 60 48 80 64 52 36 48 64 44 36 16 32 44 36z" fill="#ffeb3b"/><path d="M48 14 50 36 74 34 58 48 74 62 50 36 48 58 46 36 22 34 46 36z" fill="#fff9c4"/><circle cx="48" cy="48" r="5" fill="#fff"/></svg>`)
  },
  {
    id: 'heart4',
    label: 'Love heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 84 16 56C4 44 5 23 20 16c10-4 20-1 28 10 8-11 18-14 28-10 15 7 16 28 4 40L48 84z" fill="#ff1744"/><path d="M48 74 24 52c-7-7-7-20 4-25 8-3 16-1 20 8 5-9 12-11 20-8 11 5 11 18 4 25L48 74z" fill="#ff8a80"/><circle cx="32" cy="40" r="4" fill="#fff"/><circle cx="64" cy="40" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'moon4',
    label: 'Dreamy moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M60 12c-20 6-36 26-36 48 0 14 8 26 18 34-22-2-40-20-40-44 0-24 20-44 44-44 6 0 12 2 18 4z" fill="#e1bee7"/><circle cx="64" cy="24" r="5" fill="#fff59d"/><circle cx="72" cy="44" r="4" fill="#fff59d"/><circle cx="56" cy="68" r="3" fill="#fff59d"/><circle cx="68" cy="80" r="2" fill="#fff59d"/></svg>`)
  },
  {
    id: 'butterfly4',
    label: 'Blue butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 40c-12-18-30-20-34-4-2 12 6 22 18 24-6 6-8 16-2 22 8 6 18-4 24-14l2-28z" fill="#42a5f5"/><path d="M48 40c12-18 30-20 34-4 2 12-6 22-18 24 6 6 8 16 2 22-8 6-18-4-24-14l-2-28z" fill="#26c6da"/><rect x="46" y="24" width="4" height="36" rx="2" fill="#37474f"/><circle cx="48" cy="30" r="2" fill="#fff"/><circle cx="48" cy="54" r="2" fill="#fff"/></svg>`)
  },
  {
    id: 'bow4',
    label: 'Velvet bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 36c-12-16-32-16-32 0 0 8 8 14 20 14-6 6-6 14 0 16 8 6 18-6 22-14 6 8 18 14 22 14 6-2 6-10 0-16 12 0 20-8 20-16 0-16-20-16-32 0l-10 8-10-8z" fill="#ad1457"/><circle cx="48" cy="48" r="8" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'crown4',
    label: 'Jewel crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 62h64l8-24-16 8-12-20-8 20-12-20-12 20-16-8z" fill="#ffd700"/><path d="M16 68h64" stroke="#fff9c4" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="48" r="5" fill="#fff"/><circle cx="40" cy="36" r="6" fill="#fff"/><circle cx="48" cy="24" r="7" fill="#fff"/><circle cx="56" cy="36" r="6" fill="#fff"/><circle cx="72" cy="48" r="5" fill="#fff"/><circle cx="48" cy="48" r="4" fill="#ff1744"/></svg>`)
  },
  {
    id: 'wand4',
    label: 'Magic star wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 76 76 20" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/><circle cx="20" cy="76" r="7" fill="#ff4081"/><circle cx="76" cy="20" r="7" fill="#00bcd4"/><circle cx="30" cy="66" r="4" fill="#f8bbd0"/><circle cx="66" cy="30" r="4" fill="#80deea"/><path d="M48 48l4-4m-4 4l-4 4m4-4l4 4m-4-4l-4-4" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'gem4',
    label: 'Sapphire gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 38 42 20h12l14 18-20 40-20-40z" fill="#1e88e5"/><path d="M28 38h40" stroke="#90caf9" stroke-width="4"/><path d="m42 20 6 40 6-40" stroke="#90caf9" stroke-width="3"/></svg>`)
  },
  {
    id: 'sparkle4',
    label: 'Diamond burst',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8l6 24 24 6-24 6-6 24-6-24-24-6 24-6 6-24-6-24 6-6 24 6 24 6z" fill="#00bcd4"/><path d="M48 14l4 20 20 4-20 4-4 20-4-20-20-4 20-4 4-20-4-20 4-4 20 4 20 4z" fill="#80deea"/></svg>`)
  },
  {
    id: 'ribbon4',
    label: 'Silk ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M8 56c16-12 32-12 48 0 16-12 32-12 48 0" fill="none" stroke="#ff4081" stroke-width="6" stroke-linecap="round"/><path d="M12 56c14-8 28-8 42 0 14-8 28-8 42 0" fill="none" stroke="#f8bbd0" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'frame4',
    label: 'Ornate frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="14" y="14" width="68" height="68" rx="18" fill="none" stroke="#f8bbd0" stroke-width="6" stroke-dasharray="3 10"/><circle cx="18" cy="18" r="5" fill="#ff4081"/><circle cx="78" cy="18" r="5" fill="#7c4dff"/><circle cx="18" cy="78" r="5" fill="#7c4dff"/><circle cx="78" cy="78" r="5" fill="#ff4081"/></svg>`)
  },
  {
    id: 'cloud4',
    label: 'Dream cloud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 72c-16 0-28-12-28-26 0-12 10-22 22-24 6-16 18-28 34-28 14 0 26 10 32 24 12 0 22 12 22 26s-12 26-22 26H28z" fill="#f3e5f5"/><circle cx="32" cy="64" r="6" fill="#f8bbd0"/><circle cx="48" cy="72" r="6" fill="#f8bbd0"/><circle cx="64" cy="72" r="6" fill="#f8bbd0"/><circle cx="80" cy="64" r="6" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'tea4',
    label: 'Tea pot',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 44h64v20c0 16-14 28-32 28s-32-12-32-28v-20z" fill="#fce4ec"/><path d="M80 48h12c12 0 16 10 16 20s-4 20-16 20h-10" fill="none" stroke="#f8bbd0" stroke-width="7" stroke-linecap="round"/><path d="M24 88h48" stroke="#ff4081" stroke-width="6" stroke-linecap="round"/><path d="M28 20c0 12-12 12-12 24M48 18c0 12-12 12-12 24M68 20c0 12-12 12-12 24" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'lipstick4',
    label: 'Lipstick gold',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="34" y="16h28v32l-14 24-14-24v-32z" fill="#e91e63"/><rect x="30" y="48h36v28H30z" fill="#ffd700"/><rect x="34" y="76h28v16H34z" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'perfume4',
    label: 'Crystal perfume',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="36" y="14h24v14h-24z" fill="#ffd700"/><rect x="32" y="28h32v52h-32z" fill="#e1bee7"/><rect x="36" y="32h24v44h-24z" fill="#f3e5f5"/><circle cx="48" cy="50" r="7" fill="#ff4081"/><circle cx="48" cy="66" r="7" fill="#ff4081"/></svg>`)
  },
  {
    id: 'mirror4',
    label: 'Hand mirror gold',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="36" rx="30" ry="34" fill="#e1bee7"/><ellipse cx="48" cy="36" rx="26" ry="30" fill="#f3e5f5"/><path d="M48 70v22" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="92" r="7" fill="#ff4081"/></svg>`)
  },
  {
    id: 'brush4',
    label: 'Makeup brush gold',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="40" y="36h16v40h-16z" fill="#ffd700"/><path d="M32 36c10-10 20-10 30 0 10-10 20-10 30 0" fill="#ff4081"/><path d="M36 36c8-6 16-6 24 0 8-6 16-6 24 0" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'purse4',
    label: 'Clutch gold',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 40h48v40H24z" fill="#ff4081"/><path d="M28 32c0-16 12-20 20-20s20 4 20 20" fill="none" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="60" r="7" fill="#f8bbd0"/><circle cx="48" cy="60" r="3" fill="#fff"/></svg>`)
  },
  {
    id: 'shoe4',
    label: 'Glass slipper gold',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 64c0-14 14-20 24-20 16 0 32 12 40 24 10-8 18-8 22 0 8 8 0 18-8 22-8 8-18 8-26 0-12 12-28 24-40 24-16 0-24-12-24-24z" fill="#e1bee7"/><path d="M20 64c0-14 14-20 24-20 16 0 32 12 40 24" fill="none" stroke="#f3e5f5" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell4',
    label: 'Gold bell',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16c-16 0-28 14-28 32v24h56v-24c0-18-12-32-28-32z" fill="#ffd700"/><circle cx="48" cy="72" r="14" fill="#ff4081"/><circle cx="48" cy="72" r="10" fill="#f8bbd0"/><path d="M48 4v12" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="4" r="5" fill="#fff"/></svg>`)
  },
  {
    id: 'candy4',
    label: 'Peppermint',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="40" r="22" fill="#e91e63"/><circle cx="48" cy="40" r="18" fill="#f8bbd0"/><path d="M48 62v28" stroke="#ffd700" stroke-width="6" stroke-linecap="round"/><path d="M32 28c3-3 8-3 11 0 3-3 8-3 11 0 3-3 8-3 11 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M35 40c3 3 8 3 11 0 3 3 8 3 11 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M48 32v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M48 48v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon4',
    label: 'Heart balloon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 14c-16 0-28 14-28 32 0 12 8 22 16 28v14h24v-14c8-6 16-16 16-28 0-18-12-32-28-32z" fill="#e91e63"/><path d="M48 24c-10 0-18 8-18 22 0 8 6 16 10 20v12h16v-12c4-4 10-12 10-20 0-14-8-22-18-22z" fill="#f8bbd0"/><path d="M48 88v6" stroke="#ff4081" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'key4',
    label: 'Gold key',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 16c-18 0-32 14-32 32 0 12 8 22 18 26l-8 16h16l4-8 4 8h16l-8-16c10-4 18-14 18-26 0-18-14-32-32-32z" fill="#ffd700"/><circle cx="48" cy="48" r="12" fill="#e91e63"/></svg>`)
  },
  {
    id: 'lock4',
    label: 'Gold lock',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M28 44v-10c0-12 10-18 20-18s20 6 20 18v10h10v48H18v-48h10zm14-10v10h12v-10c0-4-2-6-6-6s-6 2-6 6z" fill="#ffd700"/><rect x="18" y="44" width="60" height="48" rx="5" fill="#ff4081"/><circle cx="48" cy="68" r="10" fill="#f8bbd0"/><circle cx="48" cy="68" r="5" fill="#fff"/></svg>`)
  },
  {
    id: 'flower9',
    label: 'Orchid',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 24c-10 0-18 10-18 22 0 6 4 12 8 16-4 8-4 18 0 24 6 4 14-4 18-16 4 8 6 18 0 24-4 6-14 4-18-16-4-8-18-8-18 0-8-6-14-14-16-4 8-14-8-18 0-8 6-14 14-16-4-8-14-8-18 0-8 6-14 14-16-4-8-14-8-18 0-8 6-14 14-16 4 8 14 8 18 0 8 6 14 14 16 4-8 14-8 18 0 8-6 14-14 16-4-8-14-8-18 0-8-6-14-14-16z" fill="#ba68c8"/><circle cx="48" cy="52" r="10" fill="#e1bee7"/></svg>`)
  },
  {
    id: 'flower10',
    label: 'Peony',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 20c-12 0-20 10-20 24 0 10 8 18 16 22-6 8-6 20 0 26 8 6 20-6 26-22 6 8 8 20 0 26-8 6-20 6-26-22-6-8-20-6-26 0-10-8-18-16-22 6-8 6-20 0-26-8-6-20-6-26 0-12 0-20 10-20 24 0 10 8 18 16 22-6 8-6 20 0 26 8 6 20-6 26-22 6 8 8 20 0 26-8 6-20 6-26-22-6-8-20-6-26 0-10-8-18-16-22 6-8 6-20 0-26-8-6-20-6-26 0-12 0-20 10-20 24z" fill="#f48fb1"/><circle cx="48" cy="48" r="12" fill="#fce4ec"/></svg>`)
  },
  {
    id: 'star5',
    label: 'Silver star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 12 54 40 84 36 64 52 84 68 54 40 48 68 42 40 12 36 40 40z" fill="#c0c0c0"/><path d="M48 18 50 40 78 38 60 52 78 66 50 40 48 62 46 40 18 38 40 40z" fill="#e0e0e0"/><circle cx="48" cy="52" r="5" fill="#fff"/></svg>`)
  },
  {
    id: 'heart5',
    label: 'Pink heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 80 20 54C8 42 9 23 24 16c9-4 18-1 24 8 6-9 15-12 24-8 15 7 16 26 4 38L48 80z" fill="#ec407a"/><path d="M48 70 27 50c-7-7-7-19 3-24 7-3 13-1 18 7 5-8 11-10 18-7 10 5 10 17 3 24L48 70z" fill="#f8bbd0"/><circle cx="32" cy="38" r="4" fill="#fff"/><circle cx="64" cy="38" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'moon5',
    label: 'Star moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M64 16c-22 8-40 30-40 52 0 16 10 28 22 36-24-4-44-24-44-52 0-28 24-52 52-52 8 0 16 2 24 6z" fill="#e1bee7"/><circle cx="68" cy="28" r="6" fill="#fff59d"/><circle cx="76" cy="48" r="5" fill="#fff59d"/><circle cx="60" cy="72" r="4" fill="#fff59d"/><circle cx="72" cy="88" r="3" fill="#fff59d"/><path d="M68 28l2-2m-2 2l-2 2m2-2l2 2m-2-2l-2-2" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'butterfly5',
    label: 'Purple butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 44c-14-20-34-22-38-4-2 14 8 26 22 28-8 8-10 20-2 26 10 6 22-6 28-18l4-32z" fill="#9c27b0"/><path d="M48 44c14-20 34-22 38-4 2 14-8 26-22 28 8 8 10 20 2 26-10 6-22-6-28-18l-4-32z" fill="#7b1fa2"/><rect x="46" y="28" width="4" height="40" rx="2" fill="#4a148c"/><circle cx="48" cy="34" r="3" fill="#fff"/><circle cx="48" cy="58" r="3" fill="#fff"/></svg>`)
  },
  {
    id: 'bow5',
    label: 'Pink bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 40c-14-18-36-18-36 0 0 10 10 16 22 16-8 8-8 18 0 20 10 8 22-8 26-20 8 8 18 16 22 16 8-2 8-12 0-20 14 0 24-10 24-20 0-18-22-18-36 0l-12 8-12-8z" fill="#ec407a"/><circle cx="48" cy="48" r="10" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'crown5',
    label: 'Silver crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 64h64l6-24-14 6-10-18-8 18-10-18-10 18-14-6z" fill="#c0c0c0"/><path d="M16 68h64" stroke="#e0e0e0" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="50" r="4" fill="#fff"/><circle cx="40" cy="38" r="5" fill="#fff"/><circle cx="48" cy="28" r="6" fill="#fff"/><circle cx="56" cy="38" r="5" fill="#fff"/><circle cx="72" cy="50" r="4" fill="#fff"/><circle cx="48" cy="48" r="3" fill="#ec407a"/></svg>`)
  },
  {
    id: 'wand5',
    label: 'Pink wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 76 76 20" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><circle cx="20" cy="76" r="6" fill="#ec407a"/><circle cx="76" cy="20" r="6" fill="#9c27b0"/><circle cx="30" cy="66" r="3" fill="#f8bbd0"/><circle cx="66" cy="30" r="3" fill="#e1bee7"/><path d="M48 48l3-3m-3 3l-3 3m3-3l3 3m-3-3l-3-3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'gem5',
    label: 'Amethyst gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 38 44 18h8l14 20-20 44-20-44z" fill="#9c27b0"/><path d="M30 38h36" stroke="#e1bee7" stroke-width="3"/><path d="m44 18 6 44 6-44" stroke="#e1bee7" stroke-width="2"/></svg>`)
  },
  {
    id: 'sparkle5',
    label: 'Pink burst',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8l6 28 28 6-28 6-6 28-6-28-28-6 28-6 6-28-6-28 6-6 28 6 28 6z" fill="#ec407a"/><path d="M48 14l4 24 24 4-24 4-4 24-4-24-24-4 24-4 4-24-4-24 4-4 24 4 24 4z" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'ribbon5',
    label: 'Pink ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M10 54c18-14 36-14 54 0 18-14 36-14 54 0" fill="none" stroke="#ec407a" stroke-width="5" stroke-linecap="round"/><path d="M14 54c16-10 32-10 48 0 16-10 32-10 48 0" fill="none" stroke="#f8bbd0" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'frame5',
    label: 'Pink frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="12" y="12" width="72" height="72" rx="20" fill="none" stroke="#f8bbd0" stroke-width="5" stroke-dasharray="2 12"/><circle cx="16" cy="16" r="6" fill="#ec407a"/><circle cx="80" cy="16" r="6" fill="#9c27b0"/><circle cx="16" cy="80" r="6" fill="#9c27b0"/><circle cx="80" cy="80" r="6" fill="#ec407a"/></svg>`)
  },
  {
    id: 'cloud5',
    label: 'Pink cloud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M30 74c-18 0-32-14-32-30 0-14 12-26 26-28 8-18 22-32 40-32 16 0 30 12 36 28 14 0 26 14 26 30s-14 30-26 30H30z" fill="#f8bbd0"/><circle cx="36" cy="64" r="6" fill="#ec407a"/><circle cx="52" cy="72" r="6" fill="#ec407a"/><circle cx="68" cy="72" r="6" fill="#ec407a"/><circle cx="84" cy="64" r="6" fill="#ec407a"/></svg>`)
  },
  {
    id: 'tea5',
    label: 'Tea cup pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M14 42h68v24c0 18-16 32-34 32s-34-14-34-32v-24z" fill="#f8bbd0"/><path d="M82 48h12c14 0 18 12 18 24s-4 24-18 24h-10" fill="none" stroke="#ec407a" stroke-width="6" stroke-linecap="round"/><path d="M22 90h52" stroke="#ec407a" stroke-width="5" stroke-linecap="round"/><path d="M26 18c0 14-14 14-14 28M48 16c0 14-14 14-14 28M70 18c0 14-14 14-14 28" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'lipstick5',
    label: 'Lipstick pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="32" y="14h32v36l-16 28-16-28v-36z" fill="#ec407a"/><rect x="28" y="50h40v32H28z" fill="#c0c0c0"/><rect x="32" y="82h32v10H32z" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'perfume5',
    label: 'Perfume pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="34" y="12h28v16h-28z" fill="#c0c0c0"/><rect x="30" y="28h36v56h-36z" fill="#f8bbd0"/><rect x="34" y="32h28v48h-28z" fill="#fce4ec"/><circle cx="48" cy="52" r="8" fill="#ec407a"/><circle cx="48" cy="70" r="8" fill="#ec407a"/></svg>`)
  },
  {
    id: 'mirror5',
    label: 'Mirror pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="34" rx="32" ry="36" fill="#f8bbd0"/><ellipse cx="48" cy="34" rx="28" ry="32" fill="#fce4ec"/><path d="M48 70v24" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="94" r="7" fill="#ec407a"/></svg>`)
  },
  {
    id: 'brush5',
    label: 'Brush pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="38" y="34h20v44h-20z" fill="#c0c0c0"/><path d="M28 34c12-12 24-12 36 0 12-12 24-12 36 0" fill="#ec407a"/><path d="M32 34c10-8 20-8 30 0 10-8 20-8 30 0" fill="#f8bbd0"/></svg>`)
  },
  {
    id: 'purse5',
    label: 'Purse pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M22 38h52v44H22z" fill="#ec407a"/><path d="M26 28c0-18 14-22 24-22s24 4 24 22" fill="none" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="60" r="8" fill="#f8bbd0"/><circle cx="48" cy="60" r="3" fill="#fff"/></svg>`)
  },
  {
    id: 'shoe5',
    label: 'Shoe pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M18 66c0-16 16-22 28-22 18 0 36 14 44 28 12-10 20-10 24 0 10 10 0 22-10 26-10 10-22 10-30 0-14 14-32 28-44 28-18 0-28-14-28-28z" fill="#f8bbd0"/><path d="M18 66c0-16 16-22 28-22 18 0 36 14 44 28" fill="none" stroke="#fce4ec" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell5',
    label: 'Bell pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 14c-18 0-32 16-32 36v28h64v-28c0-20-14-36-32-36z" fill="#c0c0c0"/><circle cx="48" cy="78" r= "16" fill="#ec407a"/><circle cx="48" cy="78" r="12" fill="#f8bbd0"/><path d="M48 2v14" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><circle cx="48" cy="2" r="5" fill="#fff"/></svg>`)
  },
  {
    id: 'candy5',
    label: 'Candy pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="36" r="26" fill="#ec407a"/><circle cx="48" cy="36" r="22" fill="#f8bbd0"/><path d="M48 62v32" stroke="#c0c0c0" stroke-width="5" stroke-linecap="round"/><path d="M28 20c4-4 10-4 14 0 4-4 10-4 14 0 4-4 10-4 14 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M32 36c4 4 10 4 14 0 4 4 10 4 14 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M48 26v10" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M48 46v10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon5',
    label: 'Balloon pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 10c-18 0-32 16-32 36 0 14 10 26 18 32v16h28v-16c8-6 18-18 18-32 0-20-14-36-32-36z" fill="#ec407a"/><path d="M48 20c-12 0-20 10-20 26 0 10 8 18 12 24v14h16v-14c4-6 12-14 12-24 0-16-8-26-20-26z" fill="#f8bbd0"/><path d="M48 94v4" stroke="#ec407a" stroke-width="2" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'key5',
    label: 'Key pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 12c-20 0-36 16-36 36 0 14 10 26 20 30l-10 18h18l5-10 5 10h18l-10-18c10-4 20-16 20-30 0-20-16-36-36-36z" fill="#c0c0c0"/><circle cx="48" cy="48" r="14" fill="#ec407a"/></svg>`)
  },
  {
    id: 'lock5',
    label: 'Lock pink',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M26 46v-12c0-14 12-20 22-20s22 6 22 20v12h12v52H14v-52h12zm16-12v12h12v-12c0-4-2-6-6-6s-6 2-6 6z" fill="#c0c0c0"/><rect x="14" y="46" width="68" height="52" rx="6" fill="#ec407a"/><circle cx="48" cy="72" r="12" fill="#f8bbd0"/><circle cx="48" cy="72" r="6" fill="#fff"/></svg>`)
  },
  {
    id: 'flower11',
    label: 'Hydrangea',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="16" fill="#e1bee7"/><circle cx="32" cy="32" r="10" fill="#ce93d8"/><circle cx="64" cy="32" r="10" fill="#ce93d8"/><circle cx="32" cy="64" r="10" fill="#ce93d8"/><circle cx="64" cy="64" r="10" fill="#ce93d8"/><circle cx="24" cy="48" r="8" fill="#ab47bc"/><circle cx="72" cy="48" r="8" fill="#ab47bc"/><circle cx="48" cy="24" r="8" fill="#ab47bc"/><circle cx="48" cy="72" r="8" fill="#ab47bc"/></svg>`)
  },
  {
    id: 'flower12',
    label: 'Lavender',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="36" rx="8" ry="16" fill="#9c27b0"/><ellipse cx="36" cy="40" rx="6" ry="12" fill="#7b1fa2"/><ellipse cx="60" cy="40" rx="6" ry="12" fill="#7b1fa2"/><ellipse cx="30" cy="46" rx="5" ry="10" fill="#6a1b9a"/><ellipse cx="66" cy="46" rx="5" ry="10" fill="#6a1b9a"/><ellipse cx="48" cy="56v24" stroke="#6fc178" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'star6',
    label: 'Gold star',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8 56 40 88 36 64 56 88 76 56 40 48 72 40 40 8 36 40 40z" fill="#ffd700"/><path d="M48 14 52 40 82 38 60 56 82 74 52 40 48 66 44 40 14 38 40 40z" fill="#fff59d"/><circle cx="48" cy="56" r="6" fill="#fff"/></svg>`)
  },
  {
    id: 'heart6',
    label: 'Red heart',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 84 16 56C4 44 5 23 20 16c10-4 20-1 28 10 8-11 18-14 28-10 15 7 16 26 4 38L48 84z" fill="#d32f2f"/><path d="M48 74 24 52c-7-7-7-20 4-25 8-3 16-1 20 8 5-9 12-11 20-8 11 5 11 18 4 25L48 74z" fill="#ffcdd2"/><circle cx="32" cy="40" r="4" fill="#fff"/><circle cx="64" cy="40" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'moon6',
    label: 'Blue moon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M60 12c-24 8-44 32-44 56 0 18 12 32 26 40-28-6-52-28-52-60 0-32 28-60 60-60 10 0 20 4 28 8z" fill="#5c6bc0"/><circle cx="64" cy="28" r="6" fill="#fff"/><circle cx="72" cy="52" r="5" fill="#fff"/><circle cx="56" cy="76" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'butterfly6',
    label: 'Pink butterfly',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 44c-16-22-38-24-42-4-2 16 10 30 26 32-10 10-12 24-2 32 12 8 26-8 32-20l4-40z" fill="#e91e63"/><path d="M48 44c16-22 38-24 42-4 2 16-10 30-26 32 10 10 12 24 2 32-12 8-26-8-32-20l-4-40z" fill="#f06292"/><rect x="46" y="24" width="4" height="44" rx="2" fill="#4a148c"/><circle cx="48" cy="30" r="4" fill="#fff"/><circle cx="48" cy="62" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'bow6',
    label: 'Red bow',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 36c-16-20-40-20-40 0 0 12 12 18 24 18-10 10-10 20 0 24 12 10 26-10 30-24 10 10 20 18 24 18 10-4 10-14 0-24 16 0 28-12 28-24 0-20-24-20-40 0l-14 10-14-10z" fill="#d32f2f"/><circle cx="48" cy="48" r="12" fill="#ffcdd2"/></svg>`)
  },
  {
    id: 'crown6',
    label: 'Red crown',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M12 64h72l8-28-18 8-14-24-10 24-14-24-14 24-18-8z" fill="#d32f2f"/><path d="M12 70h72" stroke="#ffcdd2" stroke-width="5" stroke-linecap="round"/><circle cx="20" cy="48" r="5" fill="#fff"/><circle cx="38" cy="34" r="6" fill="#fff"/><circle cx="48" cy="22" r="8" fill="#fff"/><circle cx="58" cy="34" r="6" fill="#fff"/><circle cx="76" cy="48" r="5" fill="#fff"/><circle cx="48" cy="48" r="4" fill="#ffd700"/></svg>`)
  },
  {
    id: 'wand6',
    label: 'Red wand',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 80 80 16" stroke="#d32f2f" stroke-width="6" stroke-linecap="round"/><circle cx="16" cy="80" r="8" fill="#e91e63"/><circle cx="80" cy="16" r="8" fill="#9c27b0"/><circle cx="28" cy="68" r="5" fill="#ffcdd2"/><circle cx="68" cy="28" r="5" fill="#e1bee7"/><path d="M48 48l4-4m-4 4l-4 4m4-4l4 4m-4-4l-4-4" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'gem6',
    label: 'Ruby gem',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M26 40 44 16h8l18 24-22 48-22-48z" fill="#d32f2f"/><path d="M26 40h44" stroke="#ffcdd2" stroke-width="4"/><path d="m44 16 6 48 6-48" stroke="#ffcdd2" stroke-width="3"/></svg>`)
  },
  {
    id: 'sparkle6',
    label: 'Red burst',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 4l8 32 32 8-32 8-8 32-8-32-32-8 32-8 8-32-8-32 8-8 32 8 32 8z" fill="#d32f2f"/><path d="M48 10l6 28 28 6-28 6-6 28-6-28-28-6 28-6 6-28-6-28 6-6 28 6 28 6z" fill="#ffcdd2"/></svg>`)
  },
  {
    id: 'ribbon6',
    label: 'Red ribbon',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M6 56c20-16 40-16 60 0 20-16 40-16 60 0" fill="none" stroke="#d32f2f" stroke-width="6" stroke-linecap="round"/><path d="M10 56c18-12 36-12 54 0 18-12 36-12 54 0" fill="none" stroke="#ffcdd2" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'frame6',
    label: 'Red frame',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="10" y="10" width="76" height="76" rx="22" fill="none" stroke="#ffcdd2" stroke-width="6" stroke-dasharray="2 14"/><circle cx="14" cy="14" r="7" fill="#d32f2f"/><circle cx="82" cy="14" r="7" fill="#9c27b0"/><circle cx="14" cy="82" r="7" fill="#9c27b0"/><circle cx="82" cy="82" r="7" fill="#d32f2f"/></svg>`)
  },
  {
    id: 'cloud6',
    label: 'Red cloud',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M26 76c-20 0-36-16-36-34 0-16 14-30 30-32 10-20 26-36 48-36 18 0 34 14 42 32 16 0 30 16 30 34s-16 34-30 34H26z" fill="#ffcdd2"/><circle cx="32" cy="64" r= "7" fill="#e91e63"/><circle cx="52" cy="74" r="7" fill="#e91e63"/><circle cx="72" cy="74" r="7" fill="#e91e63"/><circle cx="92" cy="64" r="7" fill="#e91e63"/></svg>`)
  },
  {
    id: 'tea6',
    label: 'Tea pot red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M12 40h72v28c0 20-18 36-36 36s-36-16-36-36v-28z" fill="#ffcdd2"/><path d="M84 48h14c16 0 20 14 20 28s-4 28-20 28h-12" fill="none" stroke="#e91e63" stroke-width="7" stroke-linecap="round"/><path d="M20 92h56" stroke="#e91e63" stroke-width="6" stroke-linecap="round"/><path d="M24 16c0 16-16 16-16 32M48 14c0 16-16 16-16 32M72 16c0 16-16 16-16 32" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'lipstick6',
    label: 'Lipstick red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="30y="10h36v40l-18 32-18-32v-40z" fill="#d32f2f"/><rect x="26" y="50h44v36H26z" fill="#b71c1c"/><rect x="30" y="86h36v8H30z" fill="#ffcdd2"/></svg>`)
  },
  {
    id: 'perfume6',
    label: 'Perfume red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="32y="8h32v18h-32z" fill="#b71c1c"/><rect x="28" y="26h40v64h-40z" fill="#ffcdd2"/><rect x="32" y="30h32v56h-32z" fill="#ffebee"/><circle cx="48" cy="54" r="9" fill="#e91e63"/><circle cx="48" cy="74" r="9" fill="#e91e63"/></svg>`)
  },
  {
    id: 'mirror6',
    label: 'Mirror red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><ellipse cx="48" cy="32" rx="34" ry="38" fill="#ffcdd2"/><ellipse cx="48" cy="32" rx="30" ry="34" fill="#ffebee"/><path d="M48 70v26" stroke="#b71c1c" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="96" r="8" fill="#e91e63"/></svg>`)
  },
  {
    id: 'brush6',
    label: 'Brush red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="36y="30h24v52h-24z" fill="#b71c1c"/><path d="M24 30c14-14 28-14 42 0 14-14 28-14 42 0" fill="#e91e63"/><path d="M28 30c12-10 24-10 36 0 12-10 24-10 36 0" fill="#ffcdd2"/></svg>`)
  },
  {
    id: 'purse6',
    label: 'Purse red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M20 36h56v52H20z" fill="#e91e63"/><path d="M24 24c0-20 16-24 28-24s28 4 28 24" fill="none" stroke="#b71c1c" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="62" r= "9" fill="#ffcdd2"/><circle cx="48" cy="62" r="4" fill="#fff"/></svg>`)
  },
  {
    id: 'shoe6',
    label: 'Shoe red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M16 68c0-18 18-24 32-24 20 0 40 16 48 32 14-12 22-12 26 0 12 12 0 26-12 30-12 12-26 12-36 0-16 16-36 32-48 32-20 0-32-16-32-32z" fill="#ffcdd2"/><path d="M16 68c0-18 18-24 32-24 20 0 40 16 48 32" fill="none" stroke="#ffebee" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'bell6',
    label: 'Bell red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 10c-20 0-36 18-36 40v32h72v-32c0-22-16-40-36-40z" fill="#b71c1c"/><circle cx="48" cy="82" r="18" fill="#e91e63"/><circle cx="48" cy="82" r="14" fill="#ffcdd2"/><path d="M48-2v16" stroke="#b71c1c" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="-2" r="6" fill="#fff"/></svg>`)
  },
  {
    id: 'candy6',
    label: 'Candy red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="32" r= "30" fill="#d32f2f"/><circle cx="48" cy="32" r="26" fill="#ffcdd2"/><path d="M48 62v30" stroke="#b71c1c" stroke-width="6" stroke-linecap="round"/><path d="M24 14c5-5 12-5 17 0 5-5 12-5 17 0 5-5 12-5 17 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M29 32c5 5 12 5 17 0 5 5 12 5 17 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M48 20v12" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M48 44v12" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'balloon6',
    label: 'Balloon red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 6c-20 0-36 18-36 40 0 16 12 30 20 36v18h32v-18c8-6 20-20 20-36 0-22-16-40-36-40z" fill="#d32f2f"/><path d="M48 16c-14 0-24 12-24 30 0 12 10 20 14 28v16h20v-16c4-8 14-16 14-28 0-18-10-30-24-30z" fill="#ffcdd2"/><path d="M48 100v6" stroke="#e91e63" stroke-width="3" stroke-linecap="round"/></svg>`)
  },
  {
    id: 'key6',
    label: 'Key red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 8c-22 0-40 18-40 40 0 16 12 30 24 34l-12 20h20l6-12 6 12h20l-12-20c12-4 24-18 24-34 0-22-18-40-40-40z" fill="#b71c1c"/><circle cx="48" cy="48" r="16" fill="#d32f2f"/></svg>`)
  },
  {
    id: 'lock6',
    label: 'Lock red',
    svg: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M24 48v-14c0-16 14-24 24-24s24 8 24 24v14h14v60H10v-60h14zm18-14v14h12v-14c0-6-2-8-6-8s-6 2-6 8z" fill="#b71c1c"/><rect x="10" y="48" width="76" height="60" rx="7" fill="#e91e63"/><circle cx="48" cy="78" r="14" fill="#ffcdd2"/><circle cx="48" cy="78" r= "7" fill="#fff"/></svg>`)
  }
];

const STICKER_OPTIONS = ['stars', 'bows', 'hearts', 'flowers', 'moons', 'sparkles', 'tea', 'clouds'];
const AMBIENCE_OPTIONS = ['silent', 'rain', 'night', 'cafe'];
const VAULT_SLOT_OPTIONS = [
  ['primary', 'Main diary'],
  ['decoy', 'Decoy diary']
];
const AUTO_LOCK_OPTIONS = [0, 5, 10, 20, 30, 60];
const HABIT_OPTIONS = ['water', 'vitamins', 'walk', 'stretch', 'read', 'sleep routine'];
const SELF_CARE_OPTIONS = ['tea', 'wash face', 'shower', 'brush hair', 'breathing', 'text someone safe'];
const REWARD_TIERS = [
  [0, 'Seedling'],
  [8, 'Glow keeper'],
  [18, 'Sticker sprite'],
  [32, 'Moon ribbon'],
  [48, 'Memory princess']
];

const PROMPT_LIBRARY = [
  { module: 'diary', text: 'What is one feeling in your chest that needs extra gentleness tonight?' },
  { module: 'diary', text: 'Describe one tiny moment from today that felt magical, even for a second.' },
  { module: 'note', text: 'What do you want to remember later, exactly as it feels right now?' },
  { module: 'note', text: 'Write a tiny truth you do not want to lose.' },
  { module: 'letter', text: 'What would you say if you knew your heart would be understood softly?' },
  { module: 'letter', text: 'Write the sentence you have been carrying quietly.' },
  { module: 'recipe', text: 'What memory, person, or season does this recipe belong to?' },
  { module: 'recipe', text: 'What would make this recipe feel like home?' }
];

const MOOD_DEFINITIONS = [
  { id: 'sparkly', label: 'Sparkly', support: 'You feel bright, buzzy, and lit up.' },
  { id: 'joyful', label: 'Joyful', support: 'Your heart feels warm and happy.' },
  { id: 'peaceful', label: 'Peaceful', support: 'Things feel softer, steadier, and calm.' },
  { id: 'grateful', label: 'Grateful', support: 'You are noticing good things and holding them close.' },
  { id: 'romantic', label: 'Romantic', support: 'Your heart feels tender, sweet, and full of affection.' },
  { id: 'dreamy', label: 'Dreamy', support: 'Your thoughts are floating, imaginative, and soft.' },
  { id: 'hopeful', label: 'Hopeful', support: 'You can feel a little light ahead.' },
  { id: 'anxious', label: 'Anxious', support: 'Your body or thoughts may feel jumpy or worried.' },
  { id: 'overwhelmed', label: 'Overwhelmed', support: 'Everything feels like a lot at once right now.' },
  { id: 'heartbroken', label: 'Heartbroken', support: 'Something hurts deeply, and you deserve gentleness.' }
];

const MOOD_OPTIONS = MOOD_DEFINITIONS.map(({ id }) => id);

const PRIVACY_OPTIONS = [
  ['private', 'Private'],
  ['shared', 'Shared'],
  ['secret', 'Extra secret']
];

const THEMES = [
  {
    id: 'light',
    name: 'Light mode',
    blurb: 'Soft, minimal, and bright for daytime writing.'
  },
  {
    id: 'dark',
    name: 'Dark mode',
    blurb: 'Cozy, dimmed, and gentle on your eyes at night.'
  }
];

function formatEntryTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function currentTimeValue() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function normalizeTags(input) {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function summarizeBody(text = '') {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Blank page waiting for your words';
  return compact.length > 88 ? `${compact.slice(0, 88)}…` : compact;
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdownToHtml(markdown = '') {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split(/\r?\n/);
  const htmlParts = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      flushList();
      htmlParts.push(`<h3>${line.slice(4)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      htmlParts.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      htmlParts.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }

    // Lists
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        inList = true;
        htmlParts.push('<ul>');
      }
      htmlParts.push(`<li>${line.replace(/^[-*]\s+/, '')}</li>`);
      continue;
    }

    flushList();

    // Blockquotes
    if (line.startsWith('&gt; ')) {
      htmlParts.push(`<blockquote>${line.slice(4)}</blockquote>`);
      continue;
    }

    let text = line;
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    htmlParts.push(`<p>${text}</p>`);
  }

  flushList();
  return htmlParts.join('\n');
}

function htmlToMarkdown(html = '') {
  // Create a temporary container to walk the DOM
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(nodeToMd).join('');

    switch (tag) {
      case 'h1': return `# ${inner}\n`;
      case 'h2': return `## ${inner}\n`;
      case 'h3': return `### ${inner}\n`;
      case 'h4': return `#### ${inner}\n`;
      case 'strong': case 'b': return `**${inner}**`;
      case 'em':    case 'i': return `*${inner}*`;
      case 'u':               return `__${inner}__`;
      case 's': case 'strike': case 'del': return `~~${inner}~~`;
      case 'code':            return `\`${inner}\``;
      case 'blockquote':      return inner.split('\n').map((l) => `> ${l}`).join('\n') + '\n';
      case 'ul': {
        return Array.from(node.children).map((li) =>
          `- ${Array.from(li.childNodes).map(nodeToMd).join('')}`
        ).join('\n') + '\n';
      }
      case 'ol': {
        return Array.from(node.children).map((li, i) =>
          `${i + 1}. ${Array.from(li.childNodes).map(nodeToMd).join('')}`
        ).join('\n') + '\n';
      }
      case 'li': return inner;
      case 'br': return '\n';
      case 'p':  return inner + '\n';
      case 'div': {
        // Rich editors often use divs for newlines
        const hasBlock = node.querySelector('h1,h2,h3,h4,ul,ol,blockquote');
        return hasBlock ? inner : (inner + '\n');
      }
      case 'a': return inner;
      default: return inner;
    }
  }

  const raw = Array.from(tmp.childNodes).map(nodeToMd).join('');
  // Collapse 3+ newlines to 2
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeLineList(input, max = 16) {
  return input
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function lineListText(items = []) {
  return items.join('\n');
}

function clampPercent(value, min = 6, max = 94) {
  const num = Number(value);
  if (Number.isNaN(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePlacedArtItem(item = {}, index = 0) {
  return {
    id: item.id || createNewEntryId(),
    assetId: item.assetId || SVG_ART_LIBRARY[0].id,
    customImage: item.customImage || null,
    x: clampPercent(item.x ?? 50),
    y: clampPercent(item.y ?? 50),
    z: typeof item.z === 'number' ? item.z : index + 1,
    size: clamp(item.size ?? 74, 20, 300),
    rotate: clamp(item.rotate ?? 0, -180, 180),
    flipX: Boolean(item.flipX)
  };
}

const TEXT_BLOCK_BACKGROUNDS = [
  ['transparent', 'Transparent'],
  ['#ffffff', 'White'],
  ['#fff0f5', 'Lavender Blush'],
  ['#ffe4e1', 'Misty Rose'],
  ['#ffd1dc', 'Pastel Pink'],
  ['#ffdae0', 'Soft Peach'],
  ['#e6e6fa', 'Lavender'],
  ['#f0e6ff', 'Pale Lilac'],
  ['#ffe6f0', 'Pale Pink'],
  ['#fff5ee', 'Seashell'],
  ['#f5f5dc', 'Beige'],
  ['#faf0e6', 'Linen'],
  ['#e0f2f1', 'Mint Cream'],
  ['#f1f8e9', 'Honeydew'],
  ['#fff8e1', 'Cream'],
  ['#fce4ec', 'Light Pink'],
  ['#f3e5f5', 'Light Purple'],
  ['#e8f5e9', 'Light Green'],
  ['#e3f2fd', 'Light Blue'],
  ['#fff3e0', 'Light Orange']
];

function normalizeTextBlock(item = {}, index = 0) {
  return {
    id: item.id || createNewEntryId(),
    content: item.content || '',
    x: clampPercent(item.x ?? 10),
    y: clampPercent(item.y ?? 10),
    width: clamp(item.width ?? 300, 100, 600),
    height: clamp(item.height ?? 150, 50, 400),
    z: typeof item.z === 'number' ? item.z : index + 1,
    fontSize: clamp(item.fontSize ?? 15, 10, 24),
    textColor: item.textColor || '#4a3f4a',
    backgroundColor: item.backgroundColor || 'transparent'
  };
}

function artAssetById(assetId) {
  return SVG_ART_LIBRARY.find((item) => item.id === assetId) || SVG_ART_LIBRARY[0];
}

function clampLevel(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeListInput(input, max = 6) {
  return input
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, max);
}

function getMoodDefinition(moodId) {
  return MOOD_DEFINITIONS.find((mood) => mood.id === moodId) || MOOD_DEFINITIONS[0];
}

function moodLabel(moodId) {
  return getMoodDefinition(moodId).label;
}

function moodSupport(moodId) {
  return getMoodDefinition(moodId).support;
}

function moodIntensityLabel(value) {
  return ['Whisper', 'Soft', 'Steady', 'Big', 'Stormy'][clampLevel(value, 1, 5, 3) - 1];
}

function normalizeEntry(entry = {}) {
  const moduleType = entry.moduleType || 'diary';
  return {
    ...entry,
    moduleType,
    entryType: moduleType === 'diary' ? entry.entryType || 'journal' : entry.entryType || '',
    mood: entry.mood || 'sparkly',
    moodIntensity: clampLevel(entry.moodIntensity, 1, 5, 3),
    moodBlend: Array.isArray(entry.moodBlend) ? entry.moodBlend.slice(0, 3) : [],
    moodNeeds: Array.isArray(entry.moodNeeds) ? entry.moodNeeds.slice(0, 6) : [],
    moodTriggers: Array.isArray(entry.moodTriggers) ? entry.moodTriggers.slice(0, 6) : [],
    copingActions: Array.isArray(entry.copingActions) ? entry.copingActions.slice(0, 6) : [],
    energyLevel: clampLevel(entry.energyLevel, 1, 5, 3),
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 8) : [],
    accentColor: entry.accentColor || entry.colorCategory || 'rose',
    colorCategory: entry.colorCategory || entry.accentColor || 'rose',
    folder: entry.folder || '',
    pinned: Boolean(entry.pinned),
    letterKind: entry.letterKind || 'unsent',
    stationeryTheme: entry.stationeryTheme || 'blush',
    recipient: entry.recipient || '',
    sentAt: entry.sentAt || '',
    futureDeliveryDate: entry.futureDeliveryDate || '',
    ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.slice(0, 16) : [],
    steps: Array.isArray(entry.steps) ? entry.steps.slice(0, 16) : [],
    servings: entry.servings || '',
    prepTime: entry.prepTime || '',
    recipeCategory: entry.recipeCategory || '',
    keepsakes: Array.isArray(entry.keepsakes) ? entry.keepsakes.slice(0, 12) : [],
    photoCaptions: Array.isArray(entry.photoCaptions) ? entry.photoCaptions.slice(0, 12) : [],
    voiceNotes: Array.isArray(entry.voiceNotes) ? entry.voiceNotes.slice(0, 8) : [],
    stickers: Array.isArray(entry.stickers) ? entry.stickers.slice(0, 8) : [],
    scrapbookStyle: entry.scrapbookStyle || 'petals',
    paperStyle: entry.paperStyle || 'rose-lace',
    placedArt: Array.isArray(entry.placedArt) ? entry.placedArt.slice(0, 24).map((item, index) => normalizePlacedArtItem(item, index)) : [],
    textBlocks: Array.isArray(entry.textBlocks) ? entry.textBlocks.slice(0, 12).map((item, index) => normalizeTextBlock(item, index)) : [],
    sessionLocked: Boolean(entry.sessionLocked),
    lockNote: entry.lockNote || '',
    habitWins: Array.isArray(entry.habitWins) ? entry.habitWins.slice(0, 6) : [],
    selfCareChecklist: Array.isArray(entry.selfCareChecklist) ? entry.selfCareChecklist.slice(0, 6) : [],
    attachments: Array.isArray(entry.attachments) ? entry.attachments.slice(0, 24) : [],
    voiceMemos: Array.isArray(entry.voiceMemos) ? entry.voiceMemos.slice(0, 8) : [],
    videoClips: Array.isArray(entry.videoClips) ? entry.videoClips.slice(0, 4) : [],
    locationLabel: entry.locationLabel || '',
    weatherSummary: entry.weatherSummary || '',
    temperature: entry.temperature || '',
    steps: typeof entry.steps === 'number' ? entry.steps : (entry.steps || ''),
    heartRate: entry.heartRate || '',
    goalIds: Array.isArray(entry.goalIds) ? entry.goalIds : [],
    weight: entry.weight || '',
    sleepHours: entry.sleepHours || ''
  };
}

function moodBlendText(entry) {
  return (entry.moodBlend || []).filter(Boolean).map(moodLabel).join(' + ');
}

function buildMoodSnapshot(entries) {
  const recent = sortEntriesDesc(entries)
    .map(normalizeEntry)
    .filter((entry) => entry.moduleType === 'diary' || entry.moduleType === 'letter')
    .slice(0, 7);
  if (!recent.length) {
    return {
      topMood: 'Sparkly',
      averageIntensity: 'Soft',
      frequentNeed: 'comfort',
      frequentTrigger: 'none lately'
    };
  }

  const counts = new Map();
  const needCounts = new Map();
  const triggerCounts = new Map();
  let totalIntensity = 0;

  for (const entry of recent) {
    counts.set(entry.mood, (counts.get(entry.mood) || 0) + 1);
    totalIntensity += entry.moodIntensity || 3;
    for (const need of entry.moodNeeds || []) needCounts.set(need, (needCounts.get(need) || 0) + 1);
    for (const trigger of entry.moodTriggers || []) triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
  }

  const topMoodId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'sparkly';
  const frequentNeed = [...needCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'comfort';
  const frequentTrigger = [...triggerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'none lately';

  return {
    topMood: moodLabel(topMoodId),
    averageIntensity: moodIntensityLabel(Math.round(totalIntensity / recent.length)),
    frequentNeed,
    frequentTrigger
  };
}

function matchesEntry(entry, query, moduleType, type) {
  const moduleMatches = moduleType === 'all' || entry.moduleType === moduleType;
  const typeMatches = type === 'all' || (entry.moduleType === 'diary' && entry.entryType === type);
  if (!moduleMatches || !typeMatches) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = (entry.sessionLocked
    ? [
      entry.moduleType,
      entry.privacyLevel,
      entry.entryType,
      entry.date,
      entry.folder,
      entry.letterKind,
      entry.recipeCategory,
      'locked',
      entry.lockNote
    ]
    : [
      entry.moduleType,
      entry.title,
      entry.body,
      entry.mood,
      entry.about,
      entry.privacyLevel,
      entry.entryType,
      entry.date,
      entry.folder,
      entry.colorCategory,
      entry.letterKind,
      entry.stationeryTheme,
      entry.recipient,
      entry.sentAt,
      entry.futureDeliveryDate,
      entry.recipeCategory,
      entry.servings,
      entry.prepTime,
      ...(entry.moodBlend || []),
      ...(entry.moodNeeds || []),
      ...(entry.moodTriggers || []),
      ...(entry.copingActions || []),
      ...(entry.ingredients || []),
      ...(entry.steps || []),
      ...(entry.keepsakes || []),
      ...(entry.photoCaptions || []),
      ...(entry.voiceNotes || []),
      ...(entry.stickers || []),
      entry.paperStyle,
      ...(entry.placedArt || []).map((item) => item.assetId),
      ...(entry.habitWins || []),
      ...(entry.selfCareChecklist || []),
      entry.lockNote,
      ...(entry.tags || []),
      ...(entry.attachments || []).map((att) => att.name || '')
    ])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function rewardTierForPoints(points) {
  let tier = REWARD_TIERS[0][1];
  for (const [threshold, label] of REWARD_TIERS) {
    if (points >= threshold) tier = label;
  }
  return tier;
}

function entryTypeLabel(value) {
  return ENTRY_TYPE_OPTIONS.find(([key]) => key === value)?.[1] || 'Entry';
}

function moduleLabel(value) {
  return MODULE_OPTIONS.find(([key]) => key === value)?.[1] || 'Entry';
}

function entryContextText(entry) {
  if (entry.moduleType === 'note') {
    return entry.pinned ? `Pinned • ${entry.folder || 'General'}` : entry.folder || 'Little note';
  }
  if (entry.moduleType === 'letter') {
    const kind = LETTER_KIND_OPTIONS.find(([key]) => key === entry.letterKind)?.[1] || 'Letter';
    return entry.recipient ? `${kind} • ${entry.recipient}` : kind;
  }
  if (entry.moduleType === 'recipe') {
    const parts = [entry.recipeCategory || 'Recipe', entry.prepTime || '', entry.servings ? `${entry.servings} servings` : ''];
    return parts.filter(Boolean).join(' • ');
  }
  return entryTypeLabel(entry.entryType);
}

function summarizeEntry(entry) {
  if (entry.sessionLocked) return entry.lockNote ? `Locked • ${entry.lockNote}` : 'Locked for this session';
  if (entry.body?.trim()) return summarizeBody(entry.body);
  if (entry.moduleType === 'note') return entry.folder ? `Saved in ${entry.folder}` : 'Tiny thought waiting here';
  if (entry.moduleType === 'letter') return entry.recipient ? `For ${entry.recipient}` : 'A letter waiting for its person';
  if (entry.moduleType === 'recipe') {
    const summary = [entry.ingredients?.[0], entry.ingredients?.[1]].filter(Boolean).join(', ');
    return summary || 'Add ingredients and steps to save the recipe';
  }
  return 'Blank page waiting for your words';
}

function buildLibrarySnapshot(entries) {
  const items = entries.map(normalizeEntry);
  const notes = items.filter((entry) => entry.moduleType === 'note');
  const letters = items.filter((entry) => entry.moduleType === 'letter');
  const recipes = items.filter((entry) => entry.moduleType === 'recipe');

  return {
    diaryCount: items.filter((entry) => entry.moduleType === 'diary').length,
    noteCount: notes.length,
    pinnedNotes: notes.filter((entry) => entry.pinned).length,
    letterCount: letters.length,
    sentLetters: letters.filter((entry) => entry.letterKind === 'sent').length,
    futureLetters: letters.filter((entry) => entry.letterKind === 'future-self').length,
    recipeCount: recipes.length,
    cozyRecipes: recipes.filter((entry) => entry.recipeCategory).length
  };
}

function dayMonthKey(value) {
  if (!value) return '';
  return value.slice(5, 10);
}

function diffDays(a, b) {
  const first = new Date(`${a}T00:00:00`);
  const second = new Date(`${b}T00:00:00`);
  return Math.round((first.getTime() - second.getTime()) / 86400000);
}

function buildOnThisDayEntries(entries, selectedId) {
  const selected = entries.find((entry) => entry.id === selectedId);
  const key = dayMonthKey(selected?.date || isoDate());
  return sortEntriesDesc(entries)
    .map(normalizeEntry)
    .filter((entry) => entry.id !== selectedId && dayMonthKey(entry.date) === key)
    .slice(0, 3);
}

function buildDelightSnapshot(entries) {
  const items = entries.map(normalizeEntry);
  const keepsakeCount = items.reduce((sum, entry) => sum + entry.keepsakes.length + entry.photoCaptions.length + entry.voiceNotes.length, 0);
  const stickerCount = items.reduce((sum, entry) => sum + entry.stickers.length, 0);
  const habitCount = items.reduce((sum, entry) => sum + entry.habitWins.length, 0);
  const selfCareCount = items.reduce((sum, entry) => sum + entry.selfCareChecklist.length, 0);
  const sparklePoints = keepsakeCount + stickerCount + habitCount + selfCareCount;
  const uniqueDates = [...new Set(items.map((entry) => entry.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));

  let streak = 0;
  for (let index = 0; index < uniqueDates.length; index += 1) {
    if (index === 0) {
      streak = 1;
      continue;
    }
    if (diffDays(uniqueDates[index - 1], uniqueDates[index]) === 1) streak += 1;
    else break;
  }

  return {
    keepsakeCount,
    stickerCount,
    habitCount,
    selfCareCount,
    sparklePoints,
    rewardTier: rewardTierForPoints(sparklePoints),
    streak,
    scrapbookCount: items.filter((entry) => entry.keepsakes.length || entry.photoCaptions.length || entry.voiceNotes.length).length
  };
}

function buildPrivacySnapshot(entries) {
  const items = entries.map(normalizeEntry);
  return {
    lockedEntries: items.filter((entry) => entry.sessionLocked).length,
    secretEntries: items.filter((entry) => entry.privacyLevel === 'secret').length,
    sharedEntries: items.filter((entry) => entry.privacyLevel === 'shared').length
  };
}

function suggestedPromptForEntry(entry) {
  const normalized = normalizeEntry(entry || {});
  const pool = PROMPT_LIBRARY.filter((item) => item.module === normalized.moduleType);
  const prompts = pool.length ? pool : PROMPT_LIBRARY;
  const indexSeed = (normalized.title || '').length + (normalized.tags || []).length + (normalized.body || '').length;
  return prompts[indexSeed % prompts.length]?.text || PROMPT_LIBRARY[0].text;
}

export function createApp(mount) {
  const storedUi = loadUiPrefs() || {};
  const storedAuth = loadAuthSession() || null;
  const state = {
    unlocked: false,
    key: null,
    vault: createEmptyVault(),
    selectedId: null,
    meta: loadVaultMeta(storedUi.lastVaultSlot || 'primary') || null,
    searchQuery: '',
    activeModule: 'all',
    activeType: 'all',
    activeVaultSlot: storedUi.lastVaultSlot || 'primary',
    lockTimer: null,
    lockNotice: '',
    lockVaultChoicesVisible: false,
    sessionUnlockedEntryIds: new Set(),
    deviceAuth: {
      checked: false,
      supported: false,
      platformAuthenticator: false
    },
    auth: {
      token: storedAuth?.token || null,
      email: storedAuth?.email || '',
      user: storedAuth?.user || null
    },
    ui: {
      themeId: storedUi.themeId || 'light',
      ambience: storedUi.ambience || 'silent',
      pageMotion: storedUi.pageMotion ?? true,
      comfortMode: storedUi.comfortMode ?? true,
      showDecoyVault: storedUi.showDecoyVault ?? false,
      concealVaultChoice: storedUi.concealVaultChoice ?? true,
      trustedDevice: storedUi.trustedDevice ?? false,
      autoLockMinutes: storedUi.autoLockMinutes ?? 0,
      kidMode: storedUi.kidMode ?? false,
      panicVaultSlot: storedUi.panicVaultSlot || 'decoy',
      lastVaultSlot: storedUi.lastVaultSlot || 'primary'
    },
    showAccountOverlay: false,
    showEncryptionKey: false,
    showAdminMenu: false,
    showUserManagerOverlay: false,
    showSiteManagerOverlay: false,
    adminUsers: [],
    adminUsersLoading: false,
    adminSelectedUserId: null,
    adminSelectedUser: null,
    adminSelectedUserLoading: false,
    adminSelectedUserSaving: false,
    adminSiteSummary: null,
    adminSiteSummaryLoading: false,
    folders: [],
    foldersLoading: false,
    activeFolderPath: null,
    unlockedFolderIds: new Set(),
    availableVaults: [],
    vaultsLoading: false,
    unlockedVaultSlots: new Set(),
    tags: [],
    showCalendar: false,
    calendarMonth: null,
    showAdvancedSearch: false,
    searchFilters: {},
    integrationConfig: null
  };

  // setupActivityListeners(); // Auto-lock completely disabled

  const root = el('div', { class: 'app-shell' });
  const topbar = el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'brand-title', text: 'My Secret Diary' }),
      el('div', { class: 'brand-sub', text: 'private, pretty, and protected' })
    ]),
    el('div', { class: 'top-actions' })
  ]);

  const main = el('div', { class: 'main' });
  root.append(topbar, main);
  mount.replaceChildren(root);
  const brandTitleNode = topbar.querySelector('.brand-title');
  const brandSubNode = topbar.querySelector('.brand-sub');

  function renderSignupOverlay(presetEmail = '', presetPassword = '') {
    const backDrop = el('div', { class: 'signup-overlay' });

    const firstName = el('input', { class: 'lock-input', placeholder: 'First name' });
    const middleName = el('input', { class: 'lock-input', placeholder: 'Middle name (optional)' });
    const lastName = el('input', { class: 'lock-input', placeholder: 'Last name' });
    const username = el('input', { class: 'lock-input', placeholder: 'Username' });
    const emailInput = el('input', { class: 'lock-input', type: 'email', placeholder: 'Email address', value: presetEmail });
    const addressLine = el('input', { class: 'lock-input', placeholder: 'Street address' });
    const city = el('input', { class: 'lock-input', placeholder: 'City' });
    const stateRegion = el('input', { class: 'lock-input', placeholder: 'State / Region' });
    const postalCode = el('input', { class: 'lock-input', placeholder: 'ZIP / Postal code' });

    const country = el('select', { class: 'lock-input' }, [
      el('option', { value: '', text: 'Select your country' }),
      el('option', { value: 'US', text: 'United States' }),
      el('option', { value: 'CA', text: 'Canada' }),
      el('option', { value: 'GB', text: 'United Kingdom' }),
      el('option', { value: 'AU', text: 'Australia' }),
      el('option', { value: 'NZ', text: 'New Zealand' }),
      el('option', { value: 'IE', text: 'Ireland' }),
      el('option', { value: 'DE', text: 'Germany' }),
      el('option', { value: 'FR', text: 'France' }),
      el('option', { value: 'BR', text: 'Brazil' }),
      el('option', { value: 'IN', text: 'India' }),
      el('option', { value: 'ZA', text: 'South Africa' })
    ]);

    const pwd1 = el('input', { class: 'lock-input', type: 'password', placeholder: 'Create a password', value: presetPassword });
    const pwd2 = el('input', { class: 'lock-input', type: 'password', placeholder: 'Confirm password' });

    const status = el('div', { class: 'lock-status', text: '' });

    const submitBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        status.textContent = 'Creating your account…';
        try {
          if (pwd1.value.length < 10) throw new Error('Use at least 10 characters');
          if (pwd1.value !== pwd2.value) throw new Error('Passwords do not match');

          await unlockWithServer(emailInput.value, pwd1.value, 'register', {
            firstName: firstName.value,
            middleName: middleName.value,
            lastName: lastName.value,
            username: username.value,
            addressLine: addressLine.value,
            city: city.value,
            stateRegion: stateRegion.value,
            postalCode: postalCode.value,
            countryCode: country.value
          });

          showToast('Welcome to your diary');
          backDrop.remove();
        } catch (e) {
          status.textContent = e?.message || 'Failed to sign up';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '♡' }),
      el('span', { text: 'Create my account' })
    ]);

    const cancelBtn = el('button', {
      class: 'btn ghost',
      onclick: () => backDrop.remove()
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Cancel' })
    ]);

    const card = el('div', { class: 'signup-card' }, [
      el('div', { class: 'lock-title', text: 'Sign up for your private diary' }),
      firstName,
      middleName,
      lastName,
      username,
      emailInput,
      addressLine,
      city,
      stateRegion,
      postalCode,
      country,
      pwd1,
      pwd2,
      submitBtn,
      cancelBtn,
      status
    ]);

    backDrop.append(card);
    return backDrop;
  }

  function countEntriesInFolder(folderPath) {
    return state.vault.entries.filter((entry) => entry.folder === folderPath).length;
  }

  async function handleRenameFolder(folder) {
    const nextName = window.prompt(`Rename folder "${folder.path}" to:`, folder.path);
    if (nextName == null) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === folder.path) return;
    try {
      const { folder: updated } = await updateFolder(state.auth.token, folder.id, { path: trimmed });
      let changed = 0;
      for (const entry of state.vault.entries) {
        if (entry.folder === folder.path) {
          entry.folder = updated.path;
          changed += 1;
        }
      }
      if (changed) persistVault();
      state.folders = state.folders.map((f) => (f.id === folder.id ? updated : f));
      if (state.activeFolderPath === folder.path) state.activeFolderPath = updated.path;
      showToast(`Renamed to "${updated.path}"`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to rename folder');
    }
  }

  async function handleSetFolderPassword(folder) {
    const newPassword = window.prompt(
      folder.hasPassword
        ? `Set a new password for "${folder.path}" (leave empty to keep current):`
        : `Set a password for "${folder.path}":`
    );
    if (newPassword == null) return;
    const pw = String(newPassword);
    if (!pw) return;
    try {
      const { folder: updated } = await updateFolder(state.auth.token, folder.id, { newPassword: pw });
      state.folders = state.folders.map((f) => (f.id === folder.id ? updated : f));
      state.unlockedFolderIds.add(folder.id);
      showToast(`Password ${folder.hasPassword ? 'changed' : 'set'} for "${folder.path}"`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to set folder password');
    }
  }

  async function handleRemoveFolderPassword(folder) {
    if (!folder.hasPassword) return;
    if (!confirm(`Remove password from "${folder.path}"?`)) return;
    try {
      const { folder: updated } = await updateFolder(state.auth.token, folder.id, { clearPassword: true });
      state.folders = state.folders.map((f) => (f.id === folder.id ? updated : f));
      showToast('Password removed');
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to remove password');
    }
  }

  async function handleDeleteFolder(folder) {
    if (!confirm(`Delete folder "${folder.path}"? Entries will be kept but unassigned from this folder.`)) return;
    try {
      if (state.auth.token && typeof folder.id === 'number') {
        await deleteFolder(state.auth.token, folder.id);
      }
      let changed = 0;
      for (const entry of state.vault.entries) {
        if (entry.folder === folder.path) {
          entry.folder = '';
          changed += 1;
        }
      }
      if (changed) persistVault();
      state.folders = state.folders.filter((f) => f.id !== folder.id);
      if (state.activeFolderPath === folder.path) state.activeFolderPath = null;
      state.unlockedFolderIds.delete(folder.id);
      showToast('Folder deleted');
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to delete folder');
    }
  }

  async function handlePurgeFolder(folder) {
    const count = countEntriesInFolder(folder.path);
    if (!confirm(`PURGE folder "${folder.path}"?\nThis will PERMANENTLY move ${count} entr${count === 1 ? 'y' : 'ies'} to trash and remove the folder. Continue?`)) return;
    try {
      const now = new Date().toISOString();
      const keep = [];
      const trashed = [];
      for (const entry of state.vault.entries) {
        if (entry.folder === folder.path) {
          trashed.push({ ...entry, trashedAt: now });
        } else {
          keep.push(entry);
        }
      }
      state.vault.entries = keep;
      state.vault.trash = [...(state.vault.trash || []), ...trashed];
      if (state.selectedId && trashed.find((e) => e.id === state.selectedId)) {
        state.selectedId = keep.length ? keep[0].id : null;
      }
      persistVault();
      if (state.auth.token && typeof folder.id === 'number') {
        await deleteFolder(state.auth.token, folder.id);
      }
      state.folders = state.folders.filter((f) => f.id !== folder.id);
      if (state.activeFolderPath === folder.path) state.activeFolderPath = null;
      state.unlockedFolderIds.delete(folder.id);
      showToast(`Purged "${folder.path}" (${trashed.length} moved to trash)`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to purge folder');
    }
  }

  async function handleCreateFolderFromManager() {
    const name = window.prompt('New folder name:');
    if (name == null) return;
    const trimmed = String(name).trim();
    if (!trimmed) return;
    const pw = window.prompt(`Optional password for "${trimmed}" (leave empty for no password):`);
    if (pw == null) return;
    try {
      const { folder } = await createFolder(state.auth.token, { path: trimmed, password: String(pw) });
      state.folders.push(folder);
      if (folder.hasPassword) state.unlockedFolderIds.add(folder.id);
      showToast(`Folder "${folder.path}" created`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to create folder');
    }
  }

  function renderAccountFoldersSection() {
    if (!state.auth.user) return el('div');

    const rows = (state.folders || []).map((folder) => {
      const count = countEntriesInFolder(folder.path);
      const meta = el('div', {
        class: 'account-helper',
        text: `${count} entr${count === 1 ? 'y' : 'ies'} • ${folder.hasPassword ? 'Password set' : 'No password'}`
      });

      const actions = el('div', { class: 'folder-manager-actions' }, [
        el('button', {
          class: 'btn ghost small-btn',
          type: 'button',
          onclick: () => handleRenameFolder(folder)
        }, [el('span', { class: 'btn-ic', text: '✎' }), el('span', { text: 'Rename' })]),
        el('button', {
          class: 'btn ghost small-btn',
          type: 'button',
          onclick: () => handleSetFolderPassword(folder)
        }, [el('span', { class: 'btn-ic', text: folder.hasPassword ? '🔒' : '🔓' }), el('span', { text: folder.hasPassword ? 'Change password' : 'Lock' })]),
        folder.hasPassword ? el('button', {
          class: 'btn ghost small-btn',
          type: 'button',
          onclick: () => handleRemoveFolderPassword(folder)
        }, [el('span', { class: 'btn-ic', text: '⚿' }), el('span', { text: 'Unlock' })]) : el('span'),
        el('button', {
          class: 'btn danger ghost small-btn',
          type: 'button',
          onclick: () => handleDeleteFolder(folder)
        }, [el('span', { class: 'btn-ic', text: '✕' }), el('span', { text: 'Delete' })]),
        el('button', {
          class: 'btn danger small-btn',
          type: 'button',
          onclick: () => handlePurgeFolder(folder)
        }, [el('span', { class: 'btn-ic', text: '⚠' }), el('span', { text: 'Purge' })])
      ]);

      return el('div', { class: 'folder-manager-row' }, [
        el('div', { class: 'folder-manager-info' }, [
          el('div', { class: 'account-label', text: folder.path }),
          meta
        ]),
        actions
      ]);
    });

    const emptyState = rows.length === 0
      ? el('div', { class: 'account-helper', text: 'No folders yet. Create one below.' })
      : null;

    const createBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: handleCreateFolderFromManager
    }, [el('span', { class: 'btn-ic', text: '+' }), el('span', { text: 'New folder' })]);

    return el('div', { class: 'account-folders' }, [
      el('div', { class: 'account-section-header' }, [
        el('div', { class: 'account-label', text: 'Folder Manager' }),
        createBtn
      ]),
      emptyState || el('div', { class: 'folder-manager-list' }, rows)
    ]);
  }

  async function handleCreateVault() {
    const label = window.prompt('Name for the new vault (e.g. "Travel journal"):');
    if (label == null) return;
    const trimmedLabel = String(label).trim();
    if (!trimmedLabel) return;
    const slotName = trimmedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    if (!slotName) {
      showToast('Please use letters or numbers in the name');
      return;
    }
    const pw = window.prompt(`Optional password to lock "${trimmedLabel}" (leave empty for no password):`);
    if (pw == null) return;
    try {
      const { vault } = await createVault(state.auth.token, { slotName, label: trimmedLabel, password: String(pw) });
      state.availableVaults = [...state.availableVaults.filter((v) => v.slotName !== vault.slotName), vault];
      showToast(`Vault "${vault.label}" created`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to create vault');
    }
  }

  async function handleRenameVault(vault) {
    const nextLabel = window.prompt(`Rename "${vault.label}" to:`, vault.label);
    if (nextLabel == null) return;
    const trimmed = String(nextLabel).trim();
    if (!trimmed || trimmed === vault.label) return;
    try {
      const { vault: updated } = await updateVault(state.auth.token, vault.slotName, { label: trimmed });
      state.availableVaults = state.availableVaults.map((v) => (v.slotName === vault.slotName ? updated : v));
      showToast(`Renamed to "${updated.label}"`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to rename vault');
    }
  }

  async function handleSecureVault(vault) {
    if (vault.isPrimary) {
      showToast('Main diary cannot be locked with a password');
      return;
    }
    const newPassword = window.prompt(
      vault.hasPassword ? `New password for "${vault.label}":` : `Set a password for "${vault.label}":`
    );
    if (newPassword == null) return;
    const pw = String(newPassword);
    if (!pw) return;
    try {
      const { vault: updated } = await updateVault(state.auth.token, vault.slotName, { newPassword: pw });
      state.availableVaults = state.availableVaults.map((v) => (v.slotName === vault.slotName ? updated : v));
      state.unlockedVaultSlots.add(vault.slotName);
      showToast(`Password ${vault.hasPassword ? 'changed' : 'set'} for "${updated.label}"`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to set vault password');
    }
  }

  async function handleUnsecureVault(vault) {
    if (!vault.hasPassword) return;
    if (!confirm(`Remove password from "${vault.label}"?`)) return;
    try {
      const { vault: updated } = await updateVault(state.auth.token, vault.slotName, { clearPassword: true });
      state.availableVaults = state.availableVaults.map((v) => (v.slotName === vault.slotName ? updated : v));
      showToast('Vault password removed');
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to remove password');
    }
  }

  async function handleDeleteVault(vault) {
    if (vault.isPrimary) {
      showToast('Main diary cannot be deleted');
      return;
    }
    if (!confirm(`Permanently delete vault "${vault.label}" and all its data?`)) return;
    try {
      await deleteVault(state.auth.token, vault.slotName);
      state.availableVaults = state.availableVaults.filter((v) => v.slotName !== vault.slotName);
      state.unlockedVaultSlots.delete(vault.slotName);
      if (state.activeVaultSlot === vault.slotName) {
        switchVaultAndLock('primary', 'Vault deleted. Unlock main diary to continue.');
      }
      showToast(`Deleted "${vault.label}"`);
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to delete vault');
    }
  }

  async function handleMergeVault(vault) {
    // Merge the currently-unlocked active vault into `vault`.
    if (vault.slotName === state.activeVaultSlot) {
      showToast('Cannot merge a vault into itself');
      return;
    }
    if (!state.unlocked || !state.key) {
      showToast('Unlock your diary first to merge');
      return;
    }
    if (!confirm(`Merge entries from the currently unlocked vault INTO "${vault.label}"?\nEntries from the current vault will be copied into "${vault.label}". The source vault will remain intact. Continue?`)) return;

    const accountPassword = window.prompt('Enter your account password to merge:');
    if (accountPassword == null) return;
    const pw = String(accountPassword);
    if (!pw) return;

    try {
      await ensureSodiumReady();

      // If target has access password, verify it
      if (vault.hasPassword && !state.unlockedVaultSlots.has(vault.slotName)) {
        const vaultPw = window.prompt(`Enter access password for vault "${vault.label}":`);
        if (vaultPw == null) return;
        await verifyVaultPassword(state.auth.token, vault.slotName, String(vaultPw));
        state.unlockedVaultSlots.add(vault.slotName);
      }

      // Fetch target vault meta + data
      const remoteTarget = await loadVaultFromServer(state.auth.token, vault.slotName);
      let targetMeta = remoteTarget?.meta || null;
      let targetPayload = remoteTarget?.data || null;

      if (!targetMeta) {
        targetMeta = {
          v: 1,
          kdf: 'argon2id',
          salt: createNewVaultSalt(),
          createdAt: new Date().toISOString()
        };
      }

      const targetKey = await deriveVaultKey(pw, targetMeta.salt);

      let targetVault = { entries: [], trash: [] };
      if (targetPayload) {
        try {
          targetVault = decryptVaultOrThrow(targetPayload, targetKey);
        } catch {
          safeMemzeroKey(targetKey);
          showToast('Wrong account password for target vault');
          return;
        }
      }

      // Merge entries (skip duplicates by id)
      const existingIds = new Set((targetVault.entries || []).map((e) => e.id));
      const merged = {
        entries: [
          ...(targetVault.entries || []),
          ...state.vault.entries.filter((e) => !existingIds.has(e.id))
        ],
        trash: [
          ...(targetVault.trash || []),
          ...(state.vault.trash || [])
        ]
      };

      const newPayload = encryptVault(merged, targetKey);
      safeMemzeroKey(targetKey);

      await saveVaultToServer(state.auth.token, vault.slotName, {
        meta: targetMeta,
        data: newPayload
      });

      showToast(`Merged ${state.vault.entries.length} entries into "${vault.label}"`);
      await loadVaultsForUser();
      render(false);
    } catch (e) {
      showToast(e?.message || 'Failed to merge vaults');
    }
  }

  function renderAccountVaultsSection() {
    if (!state.auth.user) return el('div');

    const vaults = state.availableVaults.length
      ? state.availableVaults
      : [{ slotName: 'primary', label: 'Main diary', hasPassword: false, hasData: false, isPrimary: true }];

    const rows = vaults.map((vault) => {
      const isActive = state.activeVaultSlot === vault.slotName;
      const isPanic = state.ui.panicVaultSlot === vault.slotName;

      const statusText = [
        isActive ? 'Active' : null,
        vault.hasData ? 'Has data' : 'Empty',
        vault.hasPassword ? '🔒 Locked' : null,
        isPanic ? 'Panic target' : null
      ].filter(Boolean).join(' • ');

      const switchBtn = el('button', {
        class: 'btn ghost small-btn',
        type: 'button',
        disabled: isActive ? true : undefined,
        onclick: async () => {
          if (isActive) return;
          if (vault.hasPassword && !state.unlockedVaultSlots.has(vault.slotName)) {
            const pw = window.prompt(`Enter password for "${vault.label}":`);
            if (pw == null) return;
            try {
              await verifyVaultPassword(state.auth.token, vault.slotName, String(pw));
              state.unlockedVaultSlots.add(vault.slotName);
            } catch (e) {
              showToast(e?.message || 'Incorrect vault password');
              return;
            }
          }
          switchVaultAndLock(vault.slotName, `Unlock ${vault.label} to continue.`);
          state.showAccountOverlay = false;
          render();
        }
      }, [el('span', { class: 'btn-ic', text: '⇆' }), el('span', { text: isActive ? 'Current' : 'Switch' })]);

      const renameBtn = el('button', {
        class: 'btn ghost small-btn',
        type: 'button',
        onclick: () => handleRenameVault(vault)
      }, [el('span', { class: 'btn-ic', text: '✎' }), el('span', { text: 'Rename' })]);

      const secureAttrs = {
        class: `btn ghost small-btn ${vault.isPrimary ? 'is-disabled' : ''}`,
        type: 'button',
        onclick: () => {
          if (vault.isPrimary) {
            showToast('Main diary cannot be locked with a password');
            return;
          }
          handleSecureVault(vault);
        }
      };
      if (vault.isPrimary) secureAttrs.disabled = true;
      const secureBtn = el('button', secureAttrs, [
        el('span', { class: 'btn-ic', text: vault.hasPassword ? '🔒' : '🔓' }),
        el('span', { text: vault.hasPassword ? 'Change password' : 'Secure vault' })
      ]);

      const unsecureBtn = vault.hasPassword && !vault.isPrimary ? el('button', {
        class: 'btn ghost small-btn',
        type: 'button',
        onclick: () => handleUnsecureVault(vault)
      }, [el('span', { class: 'btn-ic', text: '⚿' }), el('span', { text: 'Remove password' })]) : null;

      const mergeBtn = !isActive && state.unlocked ? el('button', {
        class: 'btn ghost small-btn',
        type: 'button',
        onclick: () => handleMergeVault(vault)
      }, [el('span', { class: 'btn-ic', text: '⇲' }), el('span', { text: 'Merge into' })]) : null;

      const panicBtn = el('button', {
        class: `btn ghost small-btn ${isPanic ? 'active' : ''}`,
        type: 'button',
        onclick: () => {
          updateUiPrefs({ panicVaultSlot: vault.slotName });
          render(false);
        }
      }, [el('span', { class: 'btn-ic', text: '⚠' }), el('span', { text: isPanic ? 'Panic target' : 'Set as panic' })]);

      const deleteBtn = !vault.isPrimary ? el('button', {
        class: 'btn danger ghost small-btn',
        type: 'button',
        onclick: () => handleDeleteVault(vault)
      }, [el('span', { class: 'btn-ic', text: '✕' }), el('span', { text: 'Delete' })]) : null;

      return el('div', { class: 'folder-manager-row' }, [
        el('div', { class: 'folder-manager-info' }, [
          el('div', { class: 'account-label', text: vault.label }),
          el('div', { class: 'account-helper', text: statusText })
        ]),
        el('div', { class: 'folder-manager-actions' }, [
          switchBtn,
          renameBtn,
          secureBtn,
          unsecureBtn || el('span'),
          mergeBtn || el('span'),
          panicBtn,
          deleteBtn || el('span')
        ])
      ]);
    });

    const createBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: handleCreateVault
    }, [el('span', { class: 'btn-ic', text: '+' }), el('span', { text: 'New vault' })]);

    return el('div', { class: 'account-folders' }, [
      el('div', { class: 'account-section-header' }, [
        el('div', { class: 'account-label', text: 'Vault Manager' }),
        createBtn
      ]),
      el('div', { class: 'folder-manager-list' }, rows)
    ]);
  }

  function renderFolderOverlay() {
    const backDrop = el('div', { class: 'signup-overlay' });
    const nameInput = el('input', { class: 'lock-input', placeholder: 'New folder name' });
    const passwordInput = el('input', { class: 'lock-input', type: 'password', placeholder: 'Optional folder password' });
    const status = el('div', { class: 'lock-status', text: '' });

    const submitBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        const name = (nameInput.value || '').trim();
        const password = String(passwordInput.value || '');
        if (!name) {
          status.textContent = 'Please enter a folder name';
          return;
        }
        if (!state.auth.token) {
          status.textContent = 'Sign in before creating folders';
          return;
        }
        status.textContent = 'Creating folder…';
        try {
          const { folder } = await createFolder(state.auth.token, { path: name, password });
          state.folders.push(folder);
          const entry = getSelectedEntry();
          if (entry) {
            updateSelected({ folder: folder.path });
            showToast(`Folder set to "${folder.path}"`);
          } else {
            showToast('Folder created');
          }
          backDrop.remove();
        } catch (e) {
          status.textContent = e?.message || 'Could not create folder yet';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'Save folder' })
    ]);

    const cancelBtn = el('button', {
      class: 'btn ghost',
      onclick: () => backDrop.remove()
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Cancel' })
    ]);

    const card = el('div', { class: 'signup-card' }, [
      el('div', { class: 'lock-title', text: 'Add a folder' }),
      nameInput,
      passwordInput,
      submitBtn,
      cancelBtn,
      status
    ]);

    backDrop.append(card);
    return backDrop;
  }

  async function ensureAdminUsersLoaded() {
    if (!state.auth.token) return;
    if (state.adminUsersLoading) return;
    state.adminUsersLoading = true;
    try {
      const { users } = await adminListUsers(state.auth.token, 200);
      state.adminUsers = users || [];
    } catch (e) {
      showToast(e?.message || 'Failed to load users');
    } finally {
      state.adminUsersLoading = false;
      render(false);
    }
  }

  async function loadFoldersForUser() {
    if (!state.auth.token) return;
    state.foldersLoading = true;
    try {
      const { folders } = await listFolders(state.auth.token);
      state.folders = folders || [];
    } catch (e) {
      /* silent */
    } finally {
      state.foldersLoading = false;
    }
  }

  async function loadVaultsForUser() {
    if (!state.auth.token) return;
    state.vaultsLoading = true;
    try {
      const { vaults } = await listVaults(state.auth.token);
      state.availableVaults = vaults || [];
    } catch (e) {
      /* silent */
    } finally {
      state.vaultsLoading = false;
    }
  }

  async function ensureSiteSummaryLoaded() {
    if (!state.auth.token) return;
    if (state.adminSiteSummaryLoading) return;
    state.adminSiteSummaryLoading = true;
    try {
      state.adminSiteSummary = await adminGetSiteSummary(state.auth.token);
    } catch (e) {
      showToast(e?.message || 'Failed to load site summary');
    } finally {
      state.adminSiteSummaryLoading = false;
      render(false);
    }
  }

  function renderAdminPasswordOverlay() {
    const user = state.auth.user;
    if (!user || !user.isAdmin || !user.mustChangePassword) return null;

    const wrap = el('div', { class: 'agreement-overlay' });
    const heading = el('div', { class: 'agreement-title', text: 'Change your admin password' });
    const body = el('div', {
      class: 'agreement-body',
      text: 'This admin account is using the default password. For your safety, please choose a strong new password before continuing.'
    });

    const currentInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'Current password (admin)'
    });
    const newInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'New password (min 10 characters)'
    });
    const confirmInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'Confirm new password'
    });

    const status = el('div', { class: 'lock-status', text: '' });

    const submitBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        status.textContent = 'Updating password…';
        try {
          if (newInput.value.length < 10) throw new Error('Use at least 10 characters');
          if (newInput.value !== confirmInput.value) throw new Error('New passwords do not match');
          await changePassword(state.auth.token, currentInput.value, newInput.value);
          state.auth.user = { ...(state.auth.user || {}), mustChangePassword: false };
          saveAuthSession({ token: state.auth.token, email: state.auth.email, user: state.auth.user });
          showToast('Admin password updated');
          render(false);
        } catch (e) {
          status.textContent = e?.message || 'Could not change password yet';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'Save new password' })
    ]);

    const card = el('div', { class: 'agreement-card' }, [
      heading,
      body,
      currentInput,
      newInput,
      confirmInput,
      submitBtn,
      status
    ]);

    wrap.append(card);
    return wrap;
  }

  function renderUserManagerOverlay() {
    if (!state.showUserManagerOverlay || !state.auth.user?.isAdmin) return null;
    const rows = state.adminUsers || [];

    const title = el('div', { class: 'lock-title', text: 'User Manager' });
    const subtitle = el('div', { class: 'lock-subtle', text: 'Tap a user to view and edit their account details. Diaries remain encrypted and private to each user.' });

    const headerRow = el('div', { class: 'admin-table-row admin-table-header' }, [
      el('div', { class: 'admin-cell', text: 'Email' }),
      el('div', { class: 'admin-cell', text: 'Username' }),
      el('div', { class: 'admin-cell', text: 'Admin' }),
      el('div', { class: 'admin-cell', text: 'ToS' })
    ]);

    const bodyRows = rows.map((u) => {
      const row = el('button', {
        class: 'admin-table-row admin-row-button',
        type: 'button',
        onclick: async () => {
          state.adminSelectedUserId = u.id;
          state.adminSelectedUserLoading = true;
          render(false);
          try {
            const { user } = await adminGetUser(state.auth.token, u.id);
            state.adminSelectedUser = user || null;
          } catch (e) {
            showToast(e?.message || 'Failed to load user details');
          } finally {
            state.adminSelectedUserLoading = false;
            render(false);
          }
        }
      }, [
        el('div', { class: 'admin-cell', text: u.email }),
        el('div', { class: 'admin-cell', text: u.username || '—' }),
        el('div', { class: 'admin-cell', text: u.isAdmin ? 'Yes' : 'No' }),
        el('div', { class: 'admin-cell', text: u.tosAccepted ? 'Accepted' : 'Pending' })
      ]);
      return row;
    });

    const listColumnChildren = [headerRow, ...bodyRows];
    if (state.adminUsersLoading) {
      listColumnChildren.push(el('div', { class: 'lock-status', text: 'Loading users…' }));
    }

    const listColumn = el('div', { class: 'admin-users-column' }, listColumnChildren);

    const detail = state.adminSelectedUser;
    const detailChildren = [];

    if (state.adminSelectedUserLoading) {
      detailChildren.push(el('div', { class: 'lock-status', text: 'Loading account…' }));
    } else if (detail) {
      const status = el('div', { class: 'lock-status', text: '' });

      const emailInput = el('input', { class: 'lock-input', type: 'email', value: detail.email || '' });
      const usernameInput = el('input', { class: 'lock-input', value: detail.username || '' });
      const firstNameInput = el('input', { class: 'lock-input', value: detail.firstName || '' });
      const middleNameInput = el('input', { class: 'lock-input', value: detail.middleName || '' });
      const lastNameInput = el('input', { class: 'lock-input', value: detail.lastName || '' });
      const addressInput = el('input', { class: 'lock-input', value: detail.addressLine || '' });
      const cityInput = el('input', { class: 'lock-input', value: detail.city || '' });
      const stateRegionInput = el('input', { class: 'lock-input', value: detail.stateRegion || '' });
      const postalCodeInput = el('input', { class: 'lock-input', value: detail.postalCode || '' });
      const countryCodeInput = el('input', { class: 'lock-input', value: detail.countryCode || '' });

      const isAdminCheckbox = el('input', { type: 'checkbox' });
      if (detail.isAdmin) isAdminCheckbox.checked = true;
      const mcpCheckbox = el('input', { type: 'checkbox' });
      if (detail.mustChangePassword) mcpCheckbox.checked = true;

      const tosText = el('div', {
        class: 'account-value',
        text: detail.tosAccepted ? 'Accepted' : 'Not yet accepted'
      });

      const keyRow = el('div', { class: 'account-row' }, [
        el('div', { class: 'account-label', text: 'Encryption key' }),
        el('div', {
          class: 'account-value',
          text: 'Locked to this account. Admins cannot view or change the key or diary contents.'
        })
      ]);

      const saveBtn = el('button', {
        class: 'btn small-btn',
        type: 'button',
        onclick: async () => {
          if (state.adminSelectedUserSaving) return;
          state.adminSelectedUserSaving = true;
          status.textContent = 'Saving changes…';
          try {
            const payload = {
              email: emailInput.value,
              username: usernameInput.value,
              firstName: firstNameInput.value,
              middleName: middleNameInput.value,
              lastName: lastNameInput.value,
              addressLine: addressInput.value,
              city: cityInput.value,
              stateRegion: stateRegionInput.value,
              postalCode: postalCodeInput.value,
              countryCode: countryCodeInput.value,
              isAdmin: Boolean(isAdminCheckbox.checked),
              mustChangePassword: Boolean(mcpCheckbox.checked)
            };
            const result = await adminUpdateUser(state.auth.token, detail.id, payload);
            state.adminSelectedUser = result?.user || null;
            await ensureAdminUsersLoaded();
            status.textContent = 'Saved';
          } catch (e) {
            status.textContent = e?.message || 'Failed to save changes';
          } finally {
            state.adminSelectedUserSaving = false;
            render(false);
          }
        }
      }, [
        el('span', { class: 'btn-ic', text: '✓' }),
        el('span', { text: 'Save account' })
      ]);

      const deleteBtn = el('button', {
        class: 'btn danger ghost small-btn',
        type: 'button',
        onclick: async () => {
          if (!confirm('Delete this user and all of their diary data? This cannot be undone.')) return;
          try {
            await adminDeleteUser(state.auth.token, detail.id);
            showToast('User deleted');
            state.adminSelectedUserId = null;
            state.adminSelectedUser = null;
            await ensureAdminUsersLoaded();
          } catch (e) {
            showToast(e?.message || 'Failed to delete user');
          } finally {
            render(false);
          }
        }
      }, [
        el('span', { class: 'btn-ic', text: '✕' }),
        el('span', { text: 'Delete user' })
      ]);

      detailChildren.push(
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Email' }),
          emailInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Username' }),
          usernameInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'First name' }),
          firstNameInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Middle name' }),
          middleNameInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Last name' }),
          lastNameInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Street address' }),
          addressInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'City' }),
          cityInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'State / Region' }),
          stateRegionInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Postal code' }),
          postalCodeInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Country code' }),
          countryCodeInput
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Admin' }),
          isAdminCheckbox
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Must change password' }),
          mcpCheckbox
        ]),
        el('div', { class: 'account-row' }, [
          el('div', { class: 'account-label', text: 'Terms of Service' }),
          tosText
        ]),
        keyRow,
        el('div', { class: 'account-row' }, [
          saveBtn,
          deleteBtn
        ]),
        status
      );
    } else {
      detailChildren.push(el('div', { class: 'lock-status', text: 'Select a user to manage their account.' }));
    }

    const detailColumn = el('div', { class: 'admin-user-detail-column' }, detailChildren);

    const closeBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        state.showUserManagerOverlay = false;
        state.adminSelectedUserId = null;
        state.adminSelectedUser = null;
        render(false);
      }
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Close' })
    ]);

    const contentRow = el('div', { class: 'admin-user-manager-grid' }, [listColumn, detailColumn]);

    const card = el('div', { class: 'account-card' }, [
      title,
      subtitle,
      contentRow,
      closeBtn
    ]);

    return el('div', { class: 'account-overlay' }, [card]);
  }

  function renderSiteManagerOverlay() {
    if (!state.showSiteManagerOverlay || !state.auth.user?.isAdmin) return null;
    const summary = state.adminSiteSummary;

    const title = el('div', { class: 'lock-title', text: 'Site Manager' });
    const subtitle = el('div', { class: 'lock-subtle', text: 'High-level health and usage for this diary installation.' });

    const grid = summary ? el('div', { class: 'admin-summary-grid' }, [
      el('div', { class: 'summary-card' }, [
        el('div', { class: 'summary-label', text: 'Total users' }),
        el('div', { class: 'summary-value', text: String(summary.totalUsers) })
      ]),
      el('div', { class: 'summary-card' }, [
        el('div', { class: 'summary-label', text: 'Admins' }),
        el('div', { class: 'summary-value', text: String(summary.adminUsers) })
      ]),
      el('div', { class: 'summary-card' }, [
        el('div', { class: 'summary-label', text: 'ToS accepted' }),
        el('div', { class: 'summary-value', text: String(summary.tosAcceptedUsers) })
      ]),
      el('div', { class: 'summary-card' }, [
        el('div', { class: 'summary-label', text: 'Environment' }),
        el('div', { class: 'summary-value', text: summary.nodeEnv || 'unknown' })
      ])
    ]) : el('div', { class: 'lock-status', text: state.adminSiteSummaryLoading ? 'Loading site summary…' : 'No summary yet.' });

    const closeBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        state.showSiteManagerOverlay = false;
        render(false);
      }
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Close' })
    ]);

    const card = el('div', { class: 'account-card' }, [
      title,
      subtitle,
      grid,
      closeBtn
    ]);

    return el('div', { class: 'account-overlay' }, [card]);
  }

  function renderPasswordChangeOverlay() {
    const backDrop = el('div', { class: 'signup-overlay' });
    const currentInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'Current password'
    });
    const newInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'New password (min 10 characters)'
    });
    const confirmInput = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'Confirm new password'
    });
    const status = el('div', { class: 'lock-status', text: '' });

    const submitBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        status.textContent = 'Updating password…';
        try {
          if (newInput.value.length < 10) throw new Error('Use at least 10 characters');
          if (newInput.value !== confirmInput.value) throw new Error('New passwords do not match');
          await changePassword(state.auth.token, currentInput.value, newInput.value);
          state.auth.user = { ...(state.auth.user || {}), mustChangePassword: false };
          saveAuthSession({ token: state.auth.token, email: state.auth.email, user: state.auth.user });
          showToast('Password updated');
          backDrop.remove();
          render(false);
        } catch (e) {
          status.textContent = e?.message || 'Could not change password yet';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'Save new password' })
    ]);

    const cancelBtn = el('button', {
      class: 'btn ghost',
      onclick: () => backDrop.remove()
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Cancel' })
    ]);

    const card = el('div', { class: 'signup-card' }, [
      el('div', { class: 'lock-title', text: 'Change your password' }),
      currentInput,
      newInput,
      confirmInput,
      submitBtn,
      cancelBtn,
      status
    ]);

    backDrop.append(card);
    return backDrop;
  }

  function applyTheme() {
    root.dataset.theme = state.ui.themeId;
    root.dataset.ambience = state.ui.ambience;
    root.dataset.motion = state.ui.pageMotion ? 'on' : 'off';
    root.dataset.comfort = state.ui.comfortMode ? 'on' : 'off';
    root.dataset.kid = state.ui.kidMode ? 'on' : 'off';
    root.dataset.vault = state.activeVaultSlot;
    document.documentElement.dataset.theme = state.ui.themeId;
    brandTitleNode.textContent = state.activeVaultSlot === 'decoy' ? 'My Secret Diary · decoy' : 'My Secret Diary';
    brandSubNode.textContent = state.activeVaultSlot === 'decoy'
      ? 'soft cover story, separate vault, same encryption'
      : 'private, pretty, and protected';
  }

  function updateUiPrefs(patch) {
    Object.assign(state.ui, patch);
    saveUiPrefs(state.ui);
    applyTheme();
    scheduleAutoLock();
    render(false);
  }

  function syncVaultSlot(slot) {
    state.activeVaultSlot = slot;
    state.ui.lastVaultSlot = slot;
    state.lockVaultChoicesVisible = false;
    saveUiPrefs(state.ui);
    state.meta = loadVaultMeta(slot) || null;
  }

  function slotLabel(slot) {
    return VAULT_SLOT_OPTIONS.find(([value]) => value === slot)?.[1] || 'Diary';
  }

  function slotHasStoredVault(slot) {
    return Boolean(loadVaultMeta(slot) || loadEncryptedVault(slot));
  }

  function clearLockTimer() {
    if (!state.lockTimer) return;
    clearTimeout(state.lockTimer);
    state.lockTimer = null;
  }

  function scheduleAutoLock() {
    clearLockTimer();
    return; // Auto-lock completely disabled
  }

  function setupActivityListeners() {
    let lastActivityTime = 0;
    const activityEvents = ['keydown', 'mousedown', 'touchstart'];
    activityEvents.forEach((eventType) => {
      document.addEventListener(eventType, () => {
        resetInactivityTimer();
      }, { passive: true });
    });
    
    // Throttle mousemove and touchmove to avoid excessive resets
    const throttledEvents = ['mousemove', 'touchmove', 'scroll'];
    throttledEvents.forEach((eventType) => {
      document.addEventListener(eventType, () => {
        const now = Date.now();
        if (now - lastActivityTime > 1000) {
          lastActivityTime = now;
          resetInactivityTimer();
        }
      }, { passive: true });
    });
  }

  function resetInactivityTimer() {
    if (!state.unlocked) return;
    scheduleAutoLock();
  }

  function switchVaultAndLock(slot, message) {
    syncVaultSlot(slot);
    state.lockNotice = message || `Unlock ${VAULT_SLOT_OPTIONS.find(([value]) => value === slot)?.[1] || 'your diary'} to continue.`;
    lock();
  }

  function setTheme(themeId) {
    updateUiPrefs({ themeId });
  }

  function setTopActions(nodes) {
    const actions = [...nodes];
    if (state.auth.user) {
      const u = state.auth.user;
      const label = u.username || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
      const children = [
        el('span', { class: 'user-chip-avatar', text: (label || '?').slice(0, 1).toUpperCase() }),
        el('span', { class: 'user-chip-label', text: `Signed in as ${label}` })
      ];
      if (u.isAdmin) {
        children.push(el('span', {
          class: 'user-chip-admin-toggle',
          title: 'Open admin menu',
          onclick: (ev) => {
            ev.stopPropagation();
            state.showAdminMenu = !state.showAdminMenu;
            render(false);
          }
        }, [
          el('span', { text: 'Admin ▾' })
        ]));
      }
      const chip = el('button', {
        class: 'user-chip',
        type: 'button',
        title: 'View account & encryption details',
        onclick: () => {
          state.showAccountOverlay = true;
          state.showEncryptionKey = false;
          render(false);
        }
      }, children);

      let adminMenu = null;
      if (u.isAdmin && state.showAdminMenu) {
        adminMenu = el('div', { class: 'admin-menu' }, [
          el('div', { class: 'admin-menu-header', text: 'Admin tools' }),
          el('button', {
            class: 'admin-menu-item',
            type: 'button',
            onclick: () => {
              state.showAdminMenu = false;
              state.showUserManagerOverlay = true;
              ensureAdminUsersLoaded();
              render(false);
            }
          }, [
            el('span', { text: 'User Manager' })
          ]),
          el('button', {
            class: 'admin-menu-item',
            type: 'button',
            onclick: () => {
              state.showAdminMenu = false;
              state.showSiteManagerOverlay = true;
              ensureSiteSummaryLoaded();
              render(false);
            }
          }, [
            el('span', { text: 'Site Manager' })
          ]),
          el('button', {
            class: 'admin-menu-item',
            type: 'button',
            onclick: () => {
              const overlay = renderPasswordChangeOverlay();
              document.body.append(overlay);
              state.showAdminMenu = false;
            }
          }, [
            el('span', { text: 'Change admin password' })
          ]),
          el('button', {
            class: 'admin-menu-item',
            type: 'button',
            onclick: () => {
              state.showAdminMenu = false;
              logoutCompletely('Signed out.');
            }
          }, [
            el('span', { text: 'Sign out admin' })
          ])
        ]);
      }

      const wrapChildren = [chip];
      if (adminMenu) wrapChildren.push(adminMenu);
      const wrap = el('div', { class: 'user-chip-wrap' }, wrapChildren);

      actions.push(wrap);
    }
    topbar.querySelector('.top-actions').replaceChildren(...actions);
  }

  function captureFocusState() {
    const active = document.activeElement;
    if (!active?.matches?.('input, textarea, select')) return null;
    return {
      focusKey: active.dataset.focusKey || '',
      selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  function restoreFocusState(focusState) {
    if (!focusState?.focusKey) return;
    const next = root.querySelector(`[data-focus-key="${focusState.focusKey}"]`);
    if (!next || typeof next.focus !== 'function') return;
    next.focus();
    if (typeof next.setSelectionRange === 'function' && focusState.selectionStart !== null && focusState.selectionEnd !== null) {
      try {
        next.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
      } catch {
        // ignore selection restore failures for unsupported inputs
      }
    }
  }

  function getSelectedEntry() {
    return state.vault.entries.find((e) => e.id === state.selectedId) || null;
  }

  function getVisibleEntries() {
    const f = state.searchFilters || {};
    return sortEntriesDesc(state.vault.entries)
      .map(normalizeEntry)
      .filter((entry) => {
        if (state.activeFolderPath && entry.folder !== state.activeFolderPath) return false;
        if (!matchesEntry(entry, state.searchQuery, state.activeModule, state.activeType)) return false;
        if (f.mood && entry.mood !== f.mood) return false;
        if (f.fromDate && entry.date && entry.date < f.fromDate) return false;
        if (f.toDate && entry.date && entry.date > f.toDate) return false;
        if (f.tagId && !(entry.tags || []).some((t) => String(t.id || t) === String(f.tagId))) return false;
        return true;
      });
  }

  function showToast(message) {
    const toast = el('div', { class: 'toast', text: message });
    document.body.append(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  async function syncVaultToServer(payload) {
    if (!state.auth.token) return;
    await saveVaultToServer(state.auth.token, state.activeVaultSlot, {
      meta: state.meta,
      data: payload
    });
  }

  function persistVault() {
    const payload = encryptVault(state.vault, state.key);
    saveEncryptedVault(payload, state.activeVaultSlot);
    void syncVaultToServer(payload).catch(() => {
      state.lockNotice = 'Could not sync with server. Check API/MySQL connection.';
    });
  }

  function lock() {
    // Soft lock: clear the in-memory encryption key and vault contents so
    // entries cannot be viewed or edited until the password is entered
    // again, but keep the auth session so the user stays "signed in".
    clearLockTimer();
    state.unlocked = false;
    state.selectedId = null;
    state.lockVaultChoicesVisible = false;
    state.sessionUnlockedEntryIds = new Set();
    if (state.key) safeMemzeroKey(state.key);
    state.key = null;
    state.vault = createEmptyVault();
    state.meta = loadVaultMeta(state.activeVaultSlot) || null;
    state.activeFolderPath = null;
    state.unlockedFolderIds = new Set();
    render();
  }

  function logoutCompletely(notice) {
    lock();
    state.auth.token = null;
    state.auth.email = '';
    state.auth.user = null;
    clearAuthSession();
    if (typeof notice === 'string' && notice) {
      state.lockNotice = notice;
    }
    render();
  }

  function renderAgreementOverlay() {
    if (!state.auth.user || state.auth.user.tosAccepted) return null;

    const heading = el('div', { class: 'agreement-title', text: 'One gentle promise before you begin' });
    const body = el('div', {
      class: 'agreement-body',
      text: 'By continuing, you agree that you will not use this diary for any harmful or abusive intent. Your pages are encrypted uniquely for your account, so even if someone steals a copy of the data, it is designed to remain unreadable to them. The person hosting this diary cannot see inside your private entries and is not responsible for how you choose to use the app.'
    });
    const checkboxId = 'agreement-checkbox';
    const checkbox = el('input', { id: checkboxId, type: 'checkbox' });
    const checkboxLabel = el('label', { for: checkboxId, class: 'agreement-checkbox-label', text: 'I have read this promise and I agree to these rules for how I use my diary.' });

    const status = el('div', { class: 'lock-status', text: '' });

    const agreeBtn = el('button', {
      class: 'btn',
      disabled: 'disabled',
      onclick: async () => {
        if (!checkbox.checked) return;
        status.textContent = 'Saving your agreement…';
        try {
          await acceptTerms(state.auth.token);
          state.auth.user = { ...(state.auth.user || {}), tosAccepted: true };
          render();
        } catch (e) {
          status.textContent = e?.message || 'Could not save your agreement right now';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'I accept and want to continue' })
    ]);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) agreeBtn.removeAttribute('disabled');
      else agreeBtn.setAttribute('disabled', 'disabled');
    });

    const deleteBtn = el('button', {
      class: 'btn danger ghost',
      type: 'button',
      onclick: async () => {
        if (!confirm('This will permanently delete your account and all diary data on this server. This cannot be undone. Continue?')) return;
        try {
          await deleteAccount(state.auth.token);
        } catch (e) {
          showToast(e?.message || 'Failed to delete account');
        }
        logoutCompletely('Account deleted.');
      }
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Delete my account instead' })
    ]);

    const actionsRow = el('div', { class: 'agreement-actions' }, [agreeBtn, deleteBtn]);

    const card = el('div', { class: 'agreement-card' }, [heading, body, checkbox, checkboxLabel, actionsRow, status]);
    return el('div', { class: 'agreement-overlay' }, [card]);
  }

  function renderAccountOverlay() {
    if (!state.showAccountOverlay || !state.auth.user) return null;
    if (!state.key) return null;

    const user = state.auth.user;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email;

    let keyString = '';
    if (state.key && typeof Uint8Array !== 'undefined') {
      try {
        const bytes = state.key instanceof Uint8Array ? state.key : new Uint8Array(state.key);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        keyString = btoa(binary);
      } catch {
        keyString = '';
      }
    }

    // ── Editable profile form ──────────────────────────────────────────────
    const profileStatus = el('div', { class: 'lock-status', text: '' });

    const mkInput = (placeholder, value, opts = {}) => el('input', {
      class: 'lock-input profile-field',
      type: opts.type || 'text',
      placeholder,
      value: value || '',
      ...(opts.readonly ? { readonly: 'readonly' } : {})
    });

    const firstNameIn  = mkInput('First name',         user.firstName);
    const middleNameIn = mkInput('Middle name (optional)', user.middleName);
    const lastNameIn   = mkInput('Last name',           user.lastName);

    // Username: editable only if not yet set
    const usernameIn = mkInput(
      user.username ? user.username : 'Choose a username (permanent once set)',
      user.username || '',
      user.username ? { readonly: true } : {}
    );
    const usernameHint = user.username
      ? el('div', { class: 'profile-hint', text: '🔒 Username is permanent and cannot be changed.' })
      : el('div', { class: 'profile-hint', text: '⚠️ Choose carefully — username cannot be changed once set.' });

    const emailDisplay = el('div', { class: 'account-row' }, [
      el('div', { class: 'account-label', text: 'Email' }),
      el('div', { class: 'account-value', text: user.email })
    ]);

    const addressLine1In = mkInput('Street address (line 1)', user.addressLine);
    const cityIn         = mkInput('City',                    user.city);
    const stateIn        = mkInput('State / Region',          user.stateRegion);
    const postalIn       = mkInput('ZIP / Postal code',       user.postalCode);

    const COUNTRY_OPTIONS = [
      ['', 'Select country'],
      ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'],
      ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'],
      ['DE', 'Germany'], ['FR', 'France'], ['BR', 'Brazil'],
      ['IN', 'India'], ['ZA', 'South Africa'], ['MX', 'Mexico'],
      ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'],
      ['SG', 'Singapore'], ['PH', 'Philippines'], ['NG', 'Nigeria'],
      ['GH', 'Ghana'], ['KE', 'Kenya'], ['AR', 'Argentina'],
      ['CL', 'Chile'], ['CO', 'Colombia'], ['IT', 'Italy'],
      ['ES', 'Spain'], ['PT', 'Portugal'], ['NL', 'Netherlands'],
      ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'],
      ['FI', 'Finland'], ['PL', 'Poland'], ['RU', 'Russia'],
      ['UA', 'Ukraine'], ['TR', 'Turkey'], ['EG', 'Egypt'],
      ['OTHER', 'Other']
    ];
    const countrySelect = el('select', { class: 'lock-input profile-field' },
      COUNTRY_OPTIONS.map(([val, label]) => el('option', { value: val, text: label }))
    );
    countrySelect.value = user.countryCode || '';

    const saveProfileBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: async () => {
        profileStatus.textContent = 'Saving…';
        saveProfileBtn.disabled = true;
        try {
          const payload = {
            firstName:   firstNameIn.value.trim(),
            middleName:  middleNameIn.value.trim() || null,
            lastName:    lastNameIn.value.trim(),
            addressLine: addressLine1In.value.trim(),
            city:        cityIn.value.trim(),
            stateRegion: stateIn.value.trim(),
            postalCode:  postalIn.value.trim(),
            countryCode: countrySelect.value || null
          };
          if (!user.username) {
            payload.username = usernameIn.value.trim();
          }
          const result = await updateProfile(state.auth.token, payload);
          state.auth.user = result.user;
          saveAuthSession({ ...state.auth });
          profileStatus.textContent = '✓ Profile saved';
          showToast('Profile updated');
          render(false);
        } catch (err) {
          profileStatus.textContent = err?.message || 'Failed to save';
        } finally {
          saveProfileBtn.disabled = false;
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'Save profile' })
    ]);

    const profileSection = el('div', { class: 'account-section' }, [
      el('div', { class: 'account-section-title', text: 'Profile information' }),
      el('div', { class: 'profile-grid' }, [
        el('label', { class: 'profile-label', text: 'First name' }), firstNameIn,
        el('label', { class: 'profile-label', text: 'Middle name' }), middleNameIn,
        el('label', { class: 'profile-label', text: 'Last name' }), lastNameIn,
        el('label', { class: 'profile-label', text: 'Username' }), usernameIn,
      ]),
      usernameHint,
      emailDisplay,
      el('div', { class: 'account-section-title', style: 'margin-top:14px', text: 'Address' }),
      el('div', { class: 'profile-grid' }, [
        el('label', { class: 'profile-label', text: 'Street address' }), addressLine1In,
        el('label', { class: 'profile-label', text: 'City' }), cityIn,
        el('label', { class: 'profile-label', text: 'State / Region' }), stateIn,
        el('label', { class: 'profile-label', text: 'ZIP / Postal' }), postalIn,
        el('label', { class: 'profile-label', text: 'Country' }), countrySelect,
      ]),
      el('div', { class: 'profile-save-row' }, [saveProfileBtn, profileStatus])
    ]);

    const keyLabel = el('div', { class: 'account-label', text: 'Diary encryption key' });
    const keyHelper = el('div', {
      class: 'account-helper',
      text: 'This key is what protects your diary. Click reveal to see it, then copy and paste it somewhere safe. Never share it with anyone you do not fully trust.'
    });

    const keyField = el('input', {
      class: 'key-display',
      type: 'text',
      readonly: 'readonly',
      value: state.showEncryptionKey && keyString ? keyString : '••••••••••••••••••••••••••••••••'
    });

    const revealBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        state.showEncryptionKey = !state.showEncryptionKey;
        render(false);
      }
    }, [
      el('span', { class: 'btn-ic', text: state.showEncryptionKey ? '🙈' : '👁' }),
      el('span', { text: state.showEncryptionKey ? 'Hide key' : 'Reveal key' })
    ]);

    const closeBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        state.showAccountOverlay = false;
        state.showEncryptionKey = false;
        render(false);
      }
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Close' })
    ]);

    const copyBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: async () => {
        try {
          if (!keyString) throw new Error('Key not available yet');
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(keyString);
            showToast('Key copied. Paste it somewhere safe you control.');
          } else {
            keyField.select();
            document.execCommand('copy');
            showToast('Key copied. Paste it somewhere safe you control.');
          }
        } catch (e) {
          showToast(e?.message || 'Could not copy key right now');
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '⧉' }),
      el('span', { text: 'Copy key' })
    ]);

    const keyRow = el('div', { class: 'account-key-row' }, [keyField, copyBtn, revealBtn]);

    const changePasswordBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        const overlay = renderPasswordChangeOverlay();
        root.append(overlay);
      }
    }, [
      el('span', { class: 'btn-ic', text: '✎' }),
      el('span', { text: 'Change password' })
    ]);

    const passwordRow = el('div', { class: 'account-row' }, [
      el('div', { class: 'account-label', text: 'Password' }),
      changePasswordBtn
    ]);

    const securitySection = el('div', { class: 'account-section' }, [
      el('div', { class: 'account-section-title', text: 'Security & Privacy' }),
      el('div', { class: 'account-row' }, [
        el('div', { class: 'account-label', text: 'Two-factor auth (2FA)' }),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderTwoFactorOverlay() }, [
          el('span', { class: 'btn-ic', text: '🔐' }),
          el('span', { text: 'Manage 2FA' })
        ])
      ]),
      el('div', { class: 'account-row' }, [
        el('div', { class: 'account-label', text: 'Account recovery codes' }),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderRecoveryCodesOverlay() }, [
          el('span', { class: 'btn-ic', text: '🔑' }),
          el('span', { text: 'Recovery codes' })
        ])
      ]),
      el('div', { class: 'account-row' }, [
        el('div', { class: 'account-label', text: 'Security audit log' }),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderAuditLogOverlay() }, [
          el('span', { class: 'btn-ic', text: '📋' }),
          el('span', { text: 'View activity' })
        ])
      ])
    ]);

    const card = el('div', { class: 'account-card' }, [
      el('div', { class: 'lock-title', text: 'Your account & security' }),
      profileSection,
      passwordRow,
      keyLabel,
      keyHelper,
      keyRow,
      securitySection,
      renderAccountVaultsSection(),
      renderAccountFoldersSection(),
      closeBtn
    ]);

    return el('div', { class: 'account-overlay' }, [card]);
  }

  function renderUsernameOverlay() {
    const backDrop = el('div', { class: 'signup-overlay' });
    const input = el('input', {
      class: 'lock-input',
      placeholder: 'Choose a username (min 3 characters)',
      value: state.auth.user?.username || ''
    });
    const status = el('div', { class: 'lock-status', text: '' });

    const submitBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        status.textContent = 'Checking username…';
        try {
          const next = (input.value || '').trim();
          if (!next) {
            status.textContent = 'Please enter a username';
            return;
          }
          const { user } = await setUsername(state.auth.token, next);
          state.auth.user = user || state.auth.user;
          showToast('Username saved');
          backDrop.remove();
          render(false);
        } catch (e) {
          status.textContent = e?.message || 'Could not save username right now';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '✓' }),
      el('span', { text: 'Save username' })
    ]);

    const cancelBtn = el('button', {
      class: 'btn ghost',
      onclick: () => backDrop.remove()
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Cancel' })
    ]);

    const card = el('div', { class: 'signup-card' }, [
      el('div', { class: 'lock-title', text: 'Set your username' }),
      input,
      submitBtn,
      cancelBtn,
      status
    ]);

    backDrop.append(card);
    return backDrop;
  }

  function ensureMetaExists() {
    if (state.meta) return;
    state.meta = {
      v: 1,
      kdf: 'argon2id',
      salt: createNewVaultSalt(),
      createdAt: new Date().toISOString()
    };
    saveVaultMeta(state.meta, state.activeVaultSlot);
  }

  async function unlockWithPassword(password) {
    await ensureSodiumReady();
    ensureMetaExists();

    const key = await deriveVaultKey(password, state.meta.salt);

    const encryptedPayload = loadEncryptedVault(state.activeVaultSlot);
    let vault;
    try {
      vault = decryptVaultOrThrow(encryptedPayload, key);
    } catch {
      safeMemzeroKey(key);
      throw new Error('Wrong password');
    }

    state.key = key;
    state.vault = {
      entries: (vault.entries || []).map(normalizeEntry),
      trash: Array.isArray(vault.trash) ? vault.trash.map(normalizeEntry) : []
    };
    state.unlocked = true;
    state.sessionUnlockedEntryIds = new Set();
    state.lockNotice = '';
    scheduleAutoLock();

    if (!state.selectedId && state.vault.entries.length) {
      state.selectedId = sortEntriesDesc(state.vault.entries)[0].id;
    }

    await Promise.all([loadFoldersForUser(), loadVaultsForUser(), loadTagsForUser()]);
    if (state._pendingPrompt) {
      const pending = state._pendingPrompt;
      state._pendingPrompt = null;
      const newEntry = createEntry('quick');
      if (newEntry) updateSelected({ body: pending });
    }
    render();
  }

  async function unlockWithServer(email, password, mode = 'login', profile = null) {
    await ensureSodiumReady();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new Error('Enter a valid email');
    }
    if (!password || password.length < 10) {
      throw new Error('Use at least 10 characters');
    }

    const auth = mode === 'register'
      ? await registerUser({ ...profile, email: normalizedEmail, password })
      : await loginUser(normalizedEmail, password);

    state.auth.token = auth.token;
    state.auth.email = normalizedEmail;
    state.auth.user = auth.user || null;
    saveAuthSession({ token: state.auth.token, email: state.auth.email, user: state.auth.user });

    const remoteVault = await loadVaultFromServer(state.auth.token, state.activeVaultSlot);
    const remoteMeta = remoteVault?.meta || null;
    const remotePayload = remoteVault?.data || null;

    const localMeta = loadVaultMeta(state.activeVaultSlot) || null;
    const localPayload = loadEncryptedVault(state.activeVaultSlot) || null;

    // Prefer the server copy when it exists; otherwise fall back to the local
    // encrypted vault so entries created before registration or while offline
    // are not lost.
    const chosenMeta = remoteMeta || localMeta;
    const chosenPayload = remotePayload || localPayload;

    state.meta = chosenMeta || {
      v: 1,
      kdf: 'argon2id',
      salt: createNewVaultSalt(),
      createdAt: new Date().toISOString()
    };
    saveVaultMeta(state.meta, state.activeVaultSlot);

    const key = await deriveVaultKey(password, state.meta.salt);
    let vault;
    try {
      vault = decryptVaultOrThrow(chosenPayload, key);
    } catch {
      safeMemzeroKey(key);
      throw new Error('Wrong password for this vault');
    }

    state.key = key;
    state.vault = {
      entries: (vault.entries || []).map(normalizeEntry),
      trash: Array.isArray(vault.trash) ? vault.trash.map(normalizeEntry) : []
    };
    state.unlocked = true;
    state.sessionUnlockedEntryIds = new Set();
    state.lockNotice = '';
    scheduleAutoLock();

    if (!chosenPayload) {
      // No vault yet anywhere: create a fresh starter vault for this slot
      state.vault = state.activeVaultSlot === 'decoy' ? createDecoyStarterVault() : createEmptyVault();
      const payload = encryptVault(state.vault, state.key);
      saveEncryptedVault(payload, state.activeVaultSlot);
      await saveVaultToServer(state.auth.token, state.activeVaultSlot, {
        meta: state.meta,
        data: payload
      });
    } else {
      // Persist whatever we just decrypted locally for faster future unlocks
      saveEncryptedVault(chosenPayload, state.activeVaultSlot);

      // If the data only existed locally, push it to the server now so it
      // follows the account on future devices/logins.
      if (!remotePayload && localPayload) {
        await saveVaultToServer(state.auth.token, state.activeVaultSlot, {
          meta: state.meta,
          data: chosenPayload
        });
      }
    }

    if (!state.selectedId && state.vault.entries.length) {
      state.selectedId = sortEntriesDesc(state.vault.entries)[0].id;
    }
    render();
  }

  function toggleSelectedListValue(field, value) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const list = Array.isArray(entry[field]) ? entry[field] : [];
    updateSelected({
      [field]: list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value].slice(0, 6)
    });
  }

  function addPlacedArtToSelected(assetId, x = 50, y = 50) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextArt = [
      ...(entry.placedArt || []),
      normalizePlacedArtItem({
        assetId,
        x,
        y,
        z: (entry.placedArt || []).length + 1,
        size: 74,
        rotate: 0
      }, (entry.placedArt || []).length)
    ].slice(-24);
    updateSelected({ placedArt: nextArt });
    showToast(`${artAssetById(assetId).label} placed on the page`);
  }

  function patchPlacedArtItem(itemId, patch) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextArt = (entry.placedArt || []).map((item, index) => (
      item.id === itemId
        ? normalizePlacedArtItem({ ...item, ...patch }, index)
        : normalizePlacedArtItem(item, index)
    ));
    updateSelected({ placedArt: nextArt }, false);
  }

  function removePlacedArtFromSelected(itemId) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextArt = (entry.placedArt || []).filter((item) => item.id !== itemId);
    updateSelected({ placedArt: nextArt });
    showToast('Art removed from page');
  }

  function shiftPlacedArtLayer(itemId, direction) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const sorted = [...(entry.placedArt || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
    const index = sorted.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const swapIndex = direction < 0 ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
    const nextArt = sorted.map((item, order) => normalizePlacedArtItem({ ...item, z: order + 1 }, order));
    updateSelected({ placedArt: nextArt });
  }

  function startPlacedArtDrag(pointerEvent, board, artItem) {
    if (pointerEvent.target.closest('button')) return;
    pointerEvent.preventDefault();
    const rect = board.getBoundingClientRect();
    const startX = pointerEvent.clientX;
    const startY = pointerEvent.clientY;
    const initialX = artItem.x;
    const initialY = artItem.y;
    const onMove = (moveEvent) => {
      const x = clampPercent(initialX + ((moveEvent.clientX - startX) / rect.width) * 100);
      const y = clampPercent(initialY + ((moveEvent.clientY - startY) / rect.height) * 100);
      const el = board.querySelector(`[data-art-id="${artItem.id}"]`);
      if (el) el.style.left = `${x}%`;
      if (el) el.style.top = `${y}%`;
    };
    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const x = clampPercent(initialX + ((upEvent.clientX - startX) / rect.width) * 100);
      const y = clampPercent(initialY + ((upEvent.clientY - startY) / rect.height) * 100);
      // Update state directly without triggering render
      const entry = getSelectedEntry();
      if (!entry) return;
      const nextArt = (entry.placedArt || []).map((item, index) => (
        item.id === artItem.id
          ? normalizePlacedArtItem({ ...item, x, y }, index)
          : normalizePlacedArtItem(item, index)
      ));
      Object.assign(entry, normalizeEntry({ ...entry, placedArt: nextArt, updatedAt: new Date().toISOString() }));
      persistVault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function duplicatePlacedArt(itemId) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const item = (entry.placedArt || []).find((i) => i.id === itemId);
    if (!item) return;
    const newItem = normalizePlacedArtItem({
      ...item,
      x: Math.min(90, item.x + 5),
      y: Math.min(90, item.y + 5),
      z: (entry.placedArt || []).length + 1
    }, (entry.placedArt || []).length);
    const nextArt = [...(entry.placedArt || []), newItem].slice(-24);
    updateSelected({ placedArt: nextArt });
    showToast('Art duplicated');
  }

  function flipPlacedArt(itemId) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const item = (entry.placedArt || []).find((i) => i.id === itemId);
    if (!item) return;
    const currentFlip = item.flipX || false;
    patchPlacedArtItem(itemId, { flipX: !currentFlip });
  }

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageDrop(file, x, y) {
    if (!file.type.startsWith('image/')) {
      showToast('Please drop an image file');
      return;
    }
    try {
      const dataUri = await fileToDataUri(file);
      const entry = getSelectedEntry();
      if (!entry) return;
      const newItem = normalizePlacedArtItem({
        assetId: 'custom-image',
        customImage: dataUri,
        x,
        y,
        z: (entry.placedArt || []).length + 1,
        size: 120,
        rotate: 0
      }, (entry.placedArt || []).length);
      const nextArt = [...(entry.placedArt || []), newItem].slice(-24);
      updateSelected({ placedArt: nextArt });
      showToast('Image added to the page');
    } catch (err) {
      showToast('Failed to load image');
    }
  }

  function addTextBlockToSelected(x = 10, y = 10) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextBlocks = [
      ...(entry.textBlocks || []),
      normalizeTextBlock({
        content: 'Type your text here...',
        x,
        y,
        z: (entry.textBlocks || []).length + 1
      }, (entry.textBlocks || []).length)
    ].slice(-12);
    updateSelected({ textBlocks: nextBlocks });
    showToast('Text block added');
  }

  const textBlockDebounceTimers = new Map();

  function patchTextBlock(blockId, patch) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextBlocks = (entry.textBlocks || []).map((item, index) => (
      item.id === blockId
        ? normalizeTextBlock({ ...item, ...patch }, index)
        : normalizeTextBlock(item, index)
    ));
    updateSelected({ textBlocks: nextBlocks }, false);
  }

  function debouncedPatchTextBlock(blockId, patch) {
    const timer = textBlockDebounceTimers.get(blockId);
    if (timer) clearTimeout(timer);
    const newTimer = setTimeout(() => {
      // Update state directly without triggering render
      const entry = getSelectedEntry();
      if (!entry) return;
      const nextBlocks = (entry.textBlocks || []).map((item, index) => (
        item.id === blockId
          ? normalizeTextBlock({ ...item, ...patch }, index)
          : normalizeTextBlock(item, index)
      ));
      Object.assign(entry, normalizeEntry({ ...entry, textBlocks: nextBlocks, updatedAt: new Date().toISOString() }));
      persistVault();
      textBlockDebounceTimers.delete(blockId);
    }, 500);
    textBlockDebounceTimers.set(blockId, newTimer);
  }

  function removeTextBlock(blockId) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const nextBlocks = (entry.textBlocks || []).filter((item) => item.id !== blockId);
    updateSelected({ textBlocks: nextBlocks });
    showToast('Text block removed');
  }

  function shiftTextBlockLayer(blockId, direction) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const sorted = [...(entry.textBlocks || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
    const index = sorted.findIndex((item) => item.id === blockId);
    if (index === -1) return;
    const swapIndex = direction < 0 ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
    const nextBlocks = sorted.map((item, order) => normalizeTextBlock({ ...item, z: order + 1 }, order));
    updateSelected({ textBlocks: nextBlocks });
  }

  function startTextBlockDrag(pointerEvent, canvas, blockItem) {
    if (pointerEvent.target.closest('button') || pointerEvent.target.closest('textarea')) return;
    pointerEvent.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const startX = pointerEvent.clientX;
    const startY = pointerEvent.clientY;
    const initialX = blockItem.x;
    const initialY = blockItem.y;
    const onMove = (moveEvent) => {
      const x = clampPercent(initialX + ((moveEvent.clientX - startX) / rect.width) * 100);
      const y = clampPercent(initialY + ((moveEvent.clientY - startY) / rect.height) * 100);
      const el = canvas.querySelector(`[data-block-id="${blockItem.id}"]`);
      if (el) {
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
      }
    };
    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const x = clampPercent(initialX + ((upEvent.clientX - startX) / rect.width) * 100);
      const y = clampPercent(initialY + ((upEvent.clientY - startY) / rect.height) * 100);
      // Update state directly without triggering render
      const entry = getSelectedEntry();
      if (!entry) return;
      const nextBlocks = (entry.textBlocks || []).map((item, index) => (
        item.id === blockItem.id
          ? normalizeTextBlock({ ...item, x, y }, index)
          : normalizeTextBlock(item, index)
      ));
      Object.assign(entry, normalizeEntry({ ...entry, textBlocks: nextBlocks, updatedAt: new Date().toISOString() }));
      persistVault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function revealSelectedForSession() {
    if (!state.selectedId) return;
    state.sessionUnlockedEntryIds.add(state.selectedId);
    render(false);
  }

  function toggleSelectedSessionLock() {
    const entry = getSelectedEntry();
    if (!entry) return;
    const next = !entry.sessionLocked;
    if (next) state.sessionUnlockedEntryIds.delete(entry.id);
    else state.sessionUnlockedEntryIds.add(entry.id);
    updateSelected({ sessionLocked: next });
    showToast(next ? 'Entry session-lock enabled' : 'Entry session-lock removed');
  }

  function exportEncryptedBackup() {
    const payload = loadEncryptedVault(state.activeVaultSlot);
    if (!payload || !state.meta) {
      showToast('Nothing to back up yet');
      return;
    }
    const bundle = {
      slot: state.activeVaultSlot,
      exportedAt: new Date().toISOString(),
      meta: state.meta,
      data: payload
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diary-${state.activeVaultSlot}-backup.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Encrypted backup downloaded');
  }

  function importEncryptedBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result || '{}'));
        if (!bundle?.meta || !bundle?.data) throw new Error('Invalid backup file');
        saveVaultMeta(bundle.meta, state.activeVaultSlot);
        saveEncryptedVault(bundle.data, state.activeVaultSlot);
        state.lockNotice = 'Encrypted backup imported. Unlock to continue.';
        state.meta = loadVaultMeta(state.activeVaultSlot) || null;
        logoutCompletely('Backup imported.');
      } catch (error) {
        showToast(error?.message || 'Backup import failed');
      }
    };
    reader.readAsText(file);
  }

  function panicLock() {
    syncVaultSlot(state.ui.panicVaultSlot || 'decoy');
    state.lockNotice = 'Panic lock engaged.';
    lock();
  }

  function revealHiddenVaultChoices() {
    state.lockVaultChoicesVisible = true;
    render(false);
  }

  function createDecoyStarterVault() {
    const now = new Date().toISOString();
    const date = isoDate();
    return {
      entries: [
        normalizeEntry({
          id: createNewEntryId(),
          moduleType: 'note',
          date,
          time: currentTimeValue(),
          title: 'Errands this week',
          folder: 'Home',
          mood: 'peaceful',
          privacyLevel: 'private',
          accentColor: 'sky',
          tags: ['errands'],
          body: 'Pick up groceries, drop off package, tidy room.',
          createdAt: now,
          updatedAt: now
        }),
        normalizeEntry({
          id: createNewEntryId(),
          moduleType: 'recipe',
          date,
          time: currentTimeValue(),
          title: 'Tea cake recipe',
          recipeCategory: 'Baking',
          mood: 'grateful',
          privacyLevel: 'private',
          accentColor: 'mint',
          ingredients: ['flour', 'sugar', 'tea', 'butter'],
          steps: ['Mix ingredients', 'Bake until golden', 'Serve warm'],
          servings: '4',
          prepTime: '25 min',
          body: 'Simple and cozy enough for a rainy afternoon.',
          createdAt: now,
          updatedAt: now
        }),
        normalizeEntry({
          id: createNewEntryId(),
          date,
          time: currentTimeValue(),
          title: 'Weekend plans',
          entryType: 'quick',
          mood: 'sparkly',
          privacyLevel: 'shared',
          accentColor: 'gold',
          body: 'Movie night, laundry, and maybe try a new café.',
          createdAt: now,
          updatedAt: now
        })
      ],
      trash: []
    };
  }

  function lockEntriesWhere(predicate, label) {
    let changed = 0;
    state.vault.entries.forEach((entry) => {
      if (predicate(entry) && !entry.sessionLocked) {
        entry.sessionLocked = true;
        state.sessionUnlockedEntryIds.delete(entry.id);
        changed += 1;
      }
    });
    if (!changed) {
      showToast(`No ${label} needed locking`);
      return;
    }
    persistVault();
    render(false);
    showToast(`Locked ${changed} ${label}`);
  }

  async function refreshDeviceAuthSupport() {
    const support = {
      checked: true,
      supported: typeof window.PublicKeyCredential !== 'undefined',
      platformAuthenticator: false
    };

    if (support.supported && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      try {
        support.platformAuthenticator = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch {
        support.platformAuthenticator = false;
      }
    }

    state.deviceAuth = support;
    render(false);
  }

  function maybeCelebrateProgress(entry) {
    const normalized = normalizeEntry(entry || {});
    const points = normalized.stickers.length + normalized.keepsakes.length + normalized.photoCaptions.length + normalized.voiceNotes.length + normalized.habitWins.length + normalized.selfCareChecklist.length;
    if (points > 0 && [4, 8, 12].includes(points)) {
      showToast(`Reward unlocked: ${rewardTierForPoints(points)}`);
    }
  }

  function createEntry(entryType = 'journal') {
    const id = createNewEntryId();
    const date = isoDate();
    const now = new Date().toISOString();
    const typeTitle = {
      journal: `Dear Diary — ${formatPrettyDate(date)}`,
      quick: 'Quick little thought',
      gratitude: 'Today I feel grateful for…',
      dream: 'Dream log',
      vent: 'I need to get this out'
    };
    const entry = normalizeEntry({
      id,
      date,
      time: currentTimeValue(),
      title: typeTitle[entryType] || `Dear Diary — ${formatPrettyDate(date)}`,
      entryType,
      mood: 'sparkly',
      moodIntensity: 3,
      moodBlend: [],
      moodNeeds: ['comfort'],
      moodTriggers: [],
      copingActions: [],
      energyLevel: 3,
      privacyLevel: 'private',
      accentColor: 'rose',
      about: '',
      tags: [],
      body: '',
      createdAt: now,
      updatedAt: now
    });
    state.vault.entries.push(entry);
    state.selectedId = id;
    persistVault();
    render();
    showToast(entryType === 'quick' ? 'Quick thought added' : 'New page added');
  }

  function createNote() {
    const id = createNewEntryId();
    const date = isoDate();
    const now = new Date().toISOString();
    const entry = normalizeEntry({
      id,
      moduleType: 'note',
      date,
      time: currentTimeValue(),
      title: 'Little note',
      mood: 'peaceful',
      privacyLevel: 'private',
      accentColor: 'sky',
      colorCategory: 'sky',
      folder: 'General',
      pinned: false,
      tags: [],
      body: '',
      createdAt: now,
      updatedAt: now
    });
    state.vault.entries.push(entry);
    state.selectedId = id;
    persistVault();
    render();
    showToast('Note added');
  }

  function createLetter() {
    const id = createNewEntryId();
    const date = isoDate();
    const now = new Date().toISOString();
    const entry = normalizeEntry({
      id,
      moduleType: 'letter',
      date,
      time: currentTimeValue(),
      title: 'A letter from my heart',
      mood: 'romantic',
      moodIntensity: 3,
      privacyLevel: 'private',
      accentColor: 'violet',
      letterKind: 'unsent',
      stationeryTheme: 'blush',
      recipient: '',
      tags: [],
      body: '',
      createdAt: now,
      updatedAt: now
    });
    state.vault.entries.push(entry);
    state.selectedId = id;
    persistVault();
    render();
    showToast('Letter added');
  }

  function createRecipe() {
    const id = createNewEntryId();
    const date = isoDate();
    const now = new Date().toISOString();
    const entry = normalizeEntry({
      id,
      moduleType: 'recipe',
      date,
      time: currentTimeValue(),
      title: 'Cozy recipe card',
      mood: 'grateful',
      privacyLevel: 'private',
      accentColor: 'mint',
      recipeCategory: 'Cozy treat',
      ingredients: [''],
      steps: [''],
      servings: '2',
      prepTime: '15 min',
      tags: ['recipe'],
      body: '',
      createdAt: now,
      updatedAt: now
    });
    state.vault.entries.push(entry);
    state.selectedId = id;
    persistVault();
    render();
    showToast('Recipe saved');
  }

  function deleteEntry(id) {
    const idx = state.vault.entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const [removed] = state.vault.entries.splice(idx, 1);
    state.vault.trash.push({ ...removed, trashedAt: new Date().toISOString() });
    if (state.selectedId === id) {
      const next = sortEntriesDesc(state.vault.entries)[0];
      state.selectedId = next ? next.id : null;
    }
    persistVault();
    render();
    showToast('Moved to trash');
  }

  function updateSelected(patch, keepEditorFocus = true) {
    const entry = state.vault.entries.find((e) => e.id === state.selectedId);
    if (!entry) return;
    Object.assign(entry, normalizeEntry({ ...entry, ...patch, updatedAt: new Date().toISOString() }));
    maybeCelebrateProgress(entry);
    persistVault();
    render(keepEditorFocus);
  }

  function saveAllFormChanges() {
    if (!getSelectedEntry()) return;

    const patch = {};

    const titleInput = document.querySelector('.title-input');
    if (titleInput) patch.title = titleInput.value;

    const dateInput = document.querySelector('.date-input');
    if (dateInput) patch.date = dateInput.value;

    const timeInput = document.querySelector('.time-input');
    if (timeInput) patch.time = timeInput.value;

    const typeSelect = document.querySelector('[data-focus-key*="entryType"]');
    if (typeSelect) patch.entryType = typeSelect.value;

    const moodSelect = document.querySelector('[data-focus-key*=":mood"]');
    if (moodSelect) patch.mood = moodSelect.value;

    const privacySelect = document.querySelector('[data-focus-key*="privacy"]');
    if (privacySelect) patch.privacyLevel = privacySelect.value;

    const aboutInput = document.querySelector('[data-focus-key*="about"]');
    if (aboutInput) patch.about = aboutInput.value;

    const tagsInput = document.querySelector('[data-focus-key*="tags"]');
    if (tagsInput) patch.tags = normalizeTags(tagsInput.value);

    const folderInput = document.querySelector('[data-focus-key*="folder"]');
    if (folderInput) patch.folder = folderInput.value;

    const recipientInput = document.querySelector('[data-focus-key*="recipient"]');
    if (recipientInput) patch.recipient = recipientInput.value;

    const letterKindSelect = document.querySelector('[data-focus-key*="letterKind"]');
    if (letterKindSelect) patch.letterKind = letterKindSelect.value;

    const sentAtInput = document.querySelector('[data-focus-key*="sentAt"]');
    if (sentAtInput) patch.sentAt = sentAtInput.value;

    const futureDeliveryDateInput = document.querySelector('[data-focus-key*="futureDeliveryDate"]');
    if (futureDeliveryDateInput) patch.futureDeliveryDate = futureDeliveryDateInput.value;

    const recipeCategoryInput = document.querySelector('[data-focus-key*="recipeCategory"]');
    if (recipeCategoryInput) patch.recipeCategory = recipeCategoryInput.value;

    const prepTimeInput = document.querySelector('[data-focus-key*="prepTime"]');
    if (prepTimeInput) patch.prepTime = prepTimeInput.value;

    const servingsInput = document.querySelector('[data-focus-key*="servings"]');
    if (servingsInput) patch.servings = servingsInput.value;

    const ingredientsInput = document.querySelector('[data-focus-key*="ingredients"]');
    if (ingredientsInput) patch.ingredients = normalizeLineList(ingredientsInput.value, 16);

    const stepsInput = document.querySelector('[data-focus-key*="steps"]');
    if (stepsInput) patch.steps = normalizeLineList(stepsInput.value, 16);

    const richEditorEl = document.querySelector('.rich-editor[contenteditable]');
    if (richEditorEl) patch.body = htmlToMarkdown(richEditorEl.innerHTML);

    updateSelected(patch);
    showToast('Changes saved');
  }

  function applyPromptToSelected(prompt) {
    const entry = getSelectedEntry();
    if (!entry) return;
    const prefix = entry.body?.trim() ? `${prompt}\n\n${entry.body}` : `${prompt}\n\n`;
    updateSelected({ body: prefix });
    showToast('Prompt added');
  }

  function render(keepEditorFocus = true) {
    applyTheme();
    const focusState = keepEditorFocus ? null : captureFocusState();

    if (!state.unlocked) {
      setTopActions([]);
      main.replaceChildren(renderLockScreen());
      if (focusState) restoreFocusState(focusState);
      return;
    }

    setTopActions([
      el('button', { class: 'btn ghost', onclick: () => panicLock(), title: 'Lock diary (keep account signed in)' }, [
        el('span', { class: 'btn-ic', text: '⟡' }),
        el('span', { text: 'Lock diary' })
      ]),
      el('button', { class: 'btn ghost', onclick: () => createEntry('quick') }, [
        el('span', { class: 'btn-ic', text: '✦' }),
        el('span', { text: 'Quick thought' })
      ]),
      el('button', { class: 'btn ghost', onclick: () => createNote() }, [
        el('span', { class: 'btn-ic', text: '❀' }),
        el('span', { text: 'Note' })
      ]),
      el('button', { class: 'btn ghost', onclick: () => createLetter() }, [
        el('span', { class: 'btn-ic', text: '✉' }),
        el('span', { text: 'Letter' })
      ]),
      el('button', { class: 'btn ghost', onclick: () => createRecipe() }, [
        el('span', { class: 'btn-ic', text: '☕' }),
        el('span', { text: 'Recipe' })
      ]),
      el('button', { class: 'btn', onclick: () => createEntry() }, [
        el('span', { class: 'btn-ic', text: '+' }),
        el('span', { text: 'New page' })
      ])
    ]);

    const visibleEntries = getVisibleEntries();
    const selected = visibleEntries.find((e) => e.id === state.selectedId) || getSelectedEntry();
    const moodSnapshot = buildMoodSnapshot(state.vault.entries);
    const librarySnapshot = buildLibrarySnapshot(state.vault.entries);
    const onThisDayEntries = buildOnThisDayEntries(state.vault.entries, state.selectedId);
    const delightSnapshot = buildDelightSnapshot(state.vault.entries);
    const privacySnapshot = buildPrivacySnapshot(state.vault.entries);

    // Central feed: entry cards (moved into sidebar below search)
    const feedList = el('div', { class: 'feed-list' },
      visibleEntries.length ? visibleEntries.map((e) => {
        const active = e.id === state.selectedId;
        return el('button', {
          class: `entry-card feed-card accent-${e.accentColor || 'rose'} ${active ? 'active' : ''}`,
          onclick: () => {
            state.selectedId = e.id;
            render();
          }
        }, [
          el('div', { class: 'entry-card-top', }, [
            el('span', { class: 'entry-type-chip', text: moduleLabel(e.moduleType) }),
            el('span', { class: 'secondary-chip', text: entryContextText(e) })
          ]),
          el('div', { class: 'entry-title', text: e.title || 'Untitled' }),
          el('div', { class: 'entry-meta' }, [
            el('span', { text: formatPrettyDate(e.date) }),
            el('span', { class: 'dot', text: '•' }),
            el('span', { text: e.time || formatEntryTime(e.createdAt) || nowTime() })
          ]),
          e.moduleType !== 'recipe' ? el('div', { class: 'entry-mood-line' }, [
            el('span', { class: 'insight-chip', text: moodLabel(e.mood) }),
            el('span', { class: 'insight-chip', text: moodIntensityLabel(e.moodIntensity) }),
            moodBlendText(e)
              ? el('span', { class: 'insight-chip', text: moodBlendText(e) })
              : el('span')
          ]) : el('div', { class: 'entry-mood-line' }, [
            e.prepTime ? el('span', { class: 'insight-chip', text: e.prepTime }) : el('span'),
            e.servings ? el('span', { class: 'insight-chip', text: `${e.servings} servings` }) : el('span')
          ]),
          el('div', { class: 'entry-preview', text: summarizeEntry(e) }),
          e.tags?.length
            ? el('div', { class: 'tag-row' }, e.tags.slice(0, 3).map((tag) => el('span', { class: 'mini-tag', text: `#${tag}` })))
            : el('div')
        ]);
      }) : [
        el('div', { class: 'empty-list-card' }, [
          el('div', { class: 'empty-list-title', text: 'No pages match yet' }),
          el('div', { class: 'empty-list-sub', text: 'Try a different search, or create a new memory.' })
        ])
      ]
    );

    const editor = renderEditor(selected, keepEditorFocus);

    // Left navigation + search + entry feed
    const sidebar = el('div', { class: 'sidebar' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'My world' }),
        el('div', { class: 'sidebar-sub', text: `${state.vault.entries.length} saved • ${visibleEntries.length} shown` }),
        el('input', {
          class: 'search-input',
          placeholder: 'Search diary, notes, letters, recipes…',
          value: state.searchQuery,
          oninput: (ev) => {
            state.searchQuery = ev.target.value;
            render();
          }
        }),
        el('div', { class: 'filter-pills' }, [
          ...MODULE_OPTIONS
        ].map(([value, label]) => el('button', {
          class: `pill ${state.activeModule === value ? 'active' : ''}`,
          onclick: () => {
            state.activeModule = value;
            if (value !== 'all' && value !== 'diary') state.activeType = 'all';
            render();
          }
        }, [el('span', { text: label })]))),
        (state.activeModule === 'all' || state.activeModule === 'diary') ? el('div', { class: 'filter-pills' }, [
          ['all', 'All'],
          ...ENTRY_TYPE_OPTIONS
        ].map(([value, label]) => el('button', {
          class: `pill ${state.activeType === value ? 'active' : ''}`,
          onclick: () => {
            state.activeType = value;
            render();
          }
        }, [el('span', { text: label })]))) : el('div')
      ]),
      el('div', { class: 'nav-list' }, [
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => {
            state.activeModule = 'all';
            state.activeType = 'all';
            state.searchQuery = '';
            render();
          }
        }, [
          el('span', { class: 'nav-item-ic', text: '🏠' }),
          el('span', { class: 'nav-item-label', text: 'All entries' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => {
            state.activeModule = 'diary';
            state.activeType = 'all';
            render();
          }
        }, [
          el('span', { class: 'nav-item-ic', text: '📓' }),
          el('span', { class: 'nav-item-label', text: 'Diary pages' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => {
            state.activeModule = 'note';
            state.activeType = 'all';
            render();
          }
        }, [
          el('span', { class: 'nav-item-ic', text: '📝' }),
          el('span', { class: 'nav-item-label', text: 'Notes' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => {
            state.activeModule = 'letter';
            state.activeType = 'all';
            render();
          }
        }, [
          el('span', { class: 'nav-item-ic', text: '✉️' }),
          el('span', { class: 'nav-item-label', text: 'Letters' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => {
            state.activeModule = 'recipe';
            state.activeType = 'all';
            render();
          }
        }, [
          el('span', { class: 'nav-item-ic', text: '🍲' }),
          el('span', { class: 'nav-item-label', text: 'Recipes' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderCalendarOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '📅' }),
          el('span', { class: 'nav-item-label', text: 'Calendar view' })
        ]),
        el('button', {
          class: `nav-item ${state.showAdvancedSearch ? 'active' : ''}`,
          type: 'button',
          onclick: () => renderAdvancedSearchOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '🔍' }),
          el('span', { class: 'nav-item-label', text: 'Advanced search' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderTemplateOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '📋' }),
          el('span', { class: 'nav-item-label', text: 'Templates' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderWritingStatsOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '📊' }),
          el('span', { class: 'nav-item-label', text: 'Writing stats' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderExportOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '⬇️' }),
          el('span', { class: 'nav-item-label', text: 'Export diary' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderGoalsOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '🎯' }),
          el('span', { class: 'nav-item-label', text: 'Goals & milestones' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderReminderSettings()
        }, [
          el('span', { class: 'nav-item-ic', text: '🔔' }),
          el('span', { class: 'nav-item-label', text: 'Reminders' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderHabitOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '✅' }),
          el('span', { class: 'nav-item-label', text: 'Habit tracker' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderCollabOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '🤝' }),
          el('span', { class: 'nav-item-label', text: 'Collaborative journals' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderSocialFeedOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '🌐' }),
          el('span', { class: 'nav-item-label', text: 'Social feed' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderExtensionGuide()
        }, [
          el('span', { class: 'nav-item-ic', text: '🧩' }),
          el('span', { class: 'nav-item-label', text: 'Browser extension' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => renderCalendarSyncOverlay()
        }, [
          el('span', { class: 'nav-item-ic', text: '🗓️' }),
          el('span', { class: 'nav-item-label', text: 'Calendar sync' })
        ]),
        el('button', {
          class: 'nav-item',
          type: 'button',
          onclick: () => { state.showAccountOverlay = true; state.showEncryptionKey = false; render(false); }
        }, [
          el('span', { class: 'nav-item-ic', text: '⚙️' }),
          el('span', { class: 'nav-item-label', text: 'Account & security' })
        ])
      ]),
      state.unlocked ? el('div', { class: 'daily-prompt' }, [
        el('span', { class: 'tiny', text: '✦ Today\'s prompt' }),
        el('div', { class: 'prompt-text', text: getTodaysPrompt() })
      ]) : el('div'),
      feedList
    ]);

    const feedColumn = el('div', { class: 'feed-column' }, [
      editor
    ]);
    const rightRail = el('div', { class: 'side-rail' }, [
      renderLibraryRail(selected, librarySnapshot),
      renderPrivacyRail(selected, privacySnapshot),
      renderMemoryRail(selected, onThisDayEntries, delightSnapshot),
      renderMoodRail(selected, moodSnapshot),
      renderThemeRail()
    ]);

    main.replaceChildren(
      el('div', { class: 'layout layout-wide' }, [sidebar, feedColumn, rightRail])
    );

    // Remove any existing overlays before adding new ones to avoid duplicates
    root.querySelectorAll('.agreement-overlay, .account-overlay').forEach((node) => node.remove());

    const tosOverlay = renderAgreementOverlay();
    if (tosOverlay) {
      root.append(tosOverlay);
    }

    const adminPwdOverlay = renderAdminPasswordOverlay();
    if (!tosOverlay && adminPwdOverlay) {
      root.append(adminPwdOverlay);
    }

    const accountOverlay = renderAccountOverlay();
    if (accountOverlay) {
      root.append(accountOverlay);
    }

    const userManagerOverlay = renderUserManagerOverlay();
    if (userManagerOverlay) {
      root.append(userManagerOverlay);
    }

    const siteManagerOverlay = renderSiteManagerOverlay();
    if (siteManagerOverlay) {
      root.append(siteManagerOverlay);
    }

    if (focusState) restoreFocusState(focusState);
  }

  function renderLibraryRail(selected, snapshot) {
    const entry = selected ? normalizeEntry(selected) : null;

    return el('div', { class: 'library-rail' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'Library' }),
        el('div', { class: 'sidebar-sub', text: 'All your private little corners in one place' })
      ]),
      el('div', { class: 'library-rail-body' }, [
        el('div', { class: 'library-grid' }, [
          el('div', { class: 'library-stat' }, [el('div', { class: 'library-value', text: String(snapshot.diaryCount) }), el('div', { class: 'library-label', text: 'Diary pages' })]),
          el('div', { class: 'library-stat' }, [el('div', { class: 'library-value', text: String(snapshot.noteCount) }), el('div', { class: 'library-label', text: 'Notes' })]),
          el('div', { class: 'library-stat' }, [el('div', { class: 'library-value', text: String(snapshot.letterCount) }), el('div', { class: 'library-label', text: 'Letters' })]),
          el('div', { class: 'library-stat' }, [el('div', { class: 'library-value', text: String(snapshot.recipeCount) }), el('div', { class: 'library-label', text: 'Recipes' })])
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Little highlights' }),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Pinned notes' }), el('span', { class: 'mood-stat-value', text: String(snapshot.pinnedNotes) })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Sent letters' }), el('span', { class: 'mood-stat-value', text: String(snapshot.sentLetters) })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Future letters' }), el('span', { class: 'mood-stat-value', text: String(snapshot.futureLetters) })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Categorized recipes' }), el('span', { class: 'mood-stat-value', text: String(snapshot.cozyRecipes) })])
        ]),
        entry ? el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: `Selected ${moduleLabel(entry.moduleType)}` }),
          el('div', { class: 'mood-card-sub', text: entryContextText(entry) || 'Saved in your private library' }),
          entry.folder ? el('div', { class: 'mood-line soft', text: `Folder: ${entry.folder}` }) : el('div'),
          entry.recipient ? el('div', { class: 'mood-line soft', text: `For: ${entry.recipient}` }) : el('div'),
          entry.recipeCategory ? el('div', { class: 'mood-line soft', text: `Category: ${entry.recipeCategory}` }) : el('div')
        ]) : el('div'),
        renderFolderListCard(snapshot)
      ])
    ]);
  }

  function renderFolderListCard(snapshot) {
    const counts = new Map();
    for (const entry of state.vault.entries) {
      const key = (entry.folder || '').trim();
      const current = counts.get(key) || 0;
      counts.set(key, current + 1);
    }

    const items = state.folders.length
      ? state.folders
      : Array.from(counts.keys()).filter(Boolean).sort().map((path, index) => ({ id: `local-${index}`, path, hasPassword: false }));

    const rows = [];

    rows.push(el('button', {
      class: `folder-row ${!state.activeFolderPath ? 'active' : ''}`,
      type: 'button',
      onclick: () => {
        state.activeFolderPath = null;
        render(false);
      }
    }, [
      el('span', { class: 'folder-name', text: 'All folders' }),
      el('span', { class: 'folder-count', text: String(snapshot.diaryCount + snapshot.noteCount + snapshot.letterCount + snapshot.recipeCount) })
    ]));

    for (const folder of items) {
      const count = counts.get(folder.path) || 0;
      const isActive = state.activeFolderPath === folder.path;
      rows.push(el('button', {
        class: `folder-row ${isActive ? 'active' : ''}`,
        type: 'button',
        onclick: async () => {
          if (folder.hasPassword && !state.unlockedFolderIds.has(folder.id)) {
            const password = window.prompt(`Enter password for folder "${folder.path}"`);
            if (password == null) return;
            try {
              await verifyFolderPassword(state.auth.token, folder.id, password);
              state.unlockedFolderIds.add(folder.id);
            } catch (e) {
              showToast(e?.message || 'Incorrect folder password');
              return;
            }
          }
          state.activeFolderPath = folder.path;
          render(false);
        }
      }, [
        el('span', { class: 'folder-name', text: folder.path }),
        el('span', { class: 'folder-count', text: String(count) })
      ]));
    }

    return el('div', { class: 'mood-card' }, [
      el('div', { class: 'mood-card-title', text: 'Folders' }),
      state.foldersLoading
        ? el('div', { class: 'lock-status', text: 'Loading folders…' })
        : el('div', { class: 'folder-list' }, rows)
    ]);
  }

  function renderPrivacyRail(selected, snapshot) {
    const entry = selected ? normalizeEntry(selected) : null;
    const importInput = el('input', {
      type: 'file',
      accept: 'application/json',
      class: 'hidden-file-input',
      onchange: (ev) => importEncryptedBackup(ev.target.files?.[0])
    });

    return el('div', { class: 'privacy-rail' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'Privacy room' }),
        el('div', { class: 'sidebar-sub', text: `Unlocked vault: ${VAULT_SLOT_OPTIONS.find(([value]) => value === state.activeVaultSlot)?.[1] || 'Main diary'}` })
      ]),
      el('div', { class: 'mood-rail-body' }, [
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Vaults' }),
          el('div', { class: 'setting-pill-row' }, VAULT_SLOT_OPTIONS
            .filter(([value]) => value === 'primary' || state.ui.showDecoyVault)
            .map(([value, label]) => el('button', {
              class: `pill ${state.activeVaultSlot === value ? 'active' : ''}`,
              type: 'button',
              onclick: () => switchVaultAndLock(value, `Switched to ${label}. Unlock to continue.`)
            }, [el('span', { text: label })]))),
          el('div', { class: 'setting-row' }, [
            el('span', { class: 'detail-label', text: 'Show decoy option' }),
            el('button', { class: `toggle-chip ${state.ui.showDecoyVault ? 'active' : ''}`, type: 'button', onclick: () => updateUiPrefs({ showDecoyVault: !state.ui.showDecoyVault }) }, [el('span', { text: state.ui.showDecoyVault ? 'Visible' : 'Hidden' })])
          ]),
          el('div', { class: 'mood-line soft', text: 'Decoy stays separate and encrypted with its own password.' })
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Session safety' }),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Locked entries' }), el('span', { class: 'mood-stat-value', text: String(snapshot.lockedEntries) })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Extra secret' }), el('span', { class: 'mood-stat-value', text: String(snapshot.secretEntries) })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Shared' }), el('span', { class: 'mood-stat-value', text: String(snapshot.sharedEntries) })]),
          el('div', { class: 'button-stack' }, [
            el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => lockEntriesWhere((item) => normalizeEntry(item).privacyLevel === 'secret', 'secret entries') }, [
              el('span', { class: 'btn-ic', text: '✦' }),
              el('span', { text: 'Lock all secret' })
            ])
          ])
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Device rules' }),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Biometric readiness' }), el('span', { class: 'mood-stat-value', text: !state.deviceAuth.checked ? 'Checking…' : state.deviceAuth.platformAuthenticator ? 'Ready' : state.deviceAuth.supported ? 'Browser only' : 'Unavailable' })]),
          el('div', { class: 'setting-row' }, [
            el('span', { class: 'detail-label', text: 'Trusted device' }),
            el('button', { class: `toggle-chip ${state.ui.trustedDevice ? 'active' : ''}`, type: 'button', onclick: () => updateUiPrefs({ trustedDevice: !state.ui.trustedDevice }) }, [el('span', { text: state.ui.trustedDevice ? 'Trusted' : 'Require auto-lock' })])
          ]),
          el('div', { class: 'setting-row' }, [
            el('span', { class: 'detail-label', text: 'Auto-lock' }),
            el('div', { class: 'setting-pill-row' }, AUTO_LOCK_OPTIONS.map((minutes) => el('button', {
              class: `pill ${state.ui.autoLockMinutes === minutes ? 'active' : ''}`,
              type: 'button',
              onclick: () => updateUiPrefs({ autoLockMinutes: minutes })
            }, [el('span', { text: minutes ? `${minutes}m` : 'off' })])))
          ]),
          el('div', { class: 'setting-row' }, [
            el('span', { class: 'detail-label', text: 'Panic opens' }),
            el('div', { class: 'setting-pill-row' }, VAULT_SLOT_OPTIONS.map(([value, label]) => el('button', {
              class: `pill ${state.ui.panicVaultSlot === value ? 'active' : ''}`,
              type: 'button',
              onclick: () => updateUiPrefs({ panicVaultSlot: value })
            }, [el('span', { text: label })])))
          ]),
          el('div', { class: 'mood-line soft', text: state.deviceAuth.platformAuthenticator
            ? 'This device reports a platform authenticator. Future passkey unlock can hook into it.'
            : 'Browser passkey readiness is checked, but unlock still uses your local diary password.' })
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Encrypted backup' }),
          el('div', { class: 'button-stack' }, [
            el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => exportEncryptedBackup() }, [
              el('span', { class: 'btn-ic', text: '↓' }),
              el('span', { text: 'Download backup' })
            ]),
            el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => importInput.click() }, [
              el('span', { class: 'btn-ic', text: '↑' }),
              el('span', { text: 'Import backup' })
            ]),
            importInput
          ]),
          el('div', { class: 'mood-line soft', text: 'Backups stay encrypted; importing replaces the current selected vault slot.' })
        ])
      ])
    ]);
  }

  function renderMemoryRail(selected, onThisDayEntries, delightSnapshot) {
    const entry = selected ? normalizeEntry(selected) : null;
    const prompt = suggestedPromptForEntry(entry);

    return el('div', { class: 'memory-rail' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'Memory lane' }),
        el('div', { class: 'sidebar-sub', text: 'Helpful prompts and resurfacing notes' })
      ]),
      el('div', { class: 'mood-rail-body' }, [
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Prompt' }),
          el('div', { class: 'prompt-text', text: prompt }),
          entry ? el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => applyPromptToSelected(prompt) }, [
            el('span', { class: 'btn-ic', text: '✎' }),
            el('span', { text: 'Use prompt' })
          ]) : el('div')
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'On this day' }),
          onThisDayEntries.length
            ? el('div', { class: 'memory-list' }, onThisDayEntries.map((item) => el('button', {
              class: 'memory-item',
              type: 'button',
              onclick: () => {
                state.selectedId = item.id;
                render();
              }
            }, [
              el('div', { class: 'memory-item-title', text: item.title || 'Untitled memory' }),
              el('div', { class: 'memory-item-sub', text: `${formatPrettyDate(item.date)} • ${moduleLabel(item.moduleType)}` })
            ])))
            : el('div', { class: 'mood-card-sub', text: 'Memories from this date will appear here.' })
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Progress' }),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Reward tier' }), el('span', { class: 'mood-stat-value', text: delightSnapshot.rewardTier })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Sparkle points' }), el('span', { class: 'mood-stat-value', text: String(delightSnapshot.sparklePoints) })]),
          el('div', { class: 'mood-line soft', text: `Writing streak: ${delightSnapshot.streak} day${delightSnapshot.streak === 1 ? '' : 's'}` })
        ])
      ])
    ]);
  }

  function renderMoodRail(selected, snapshot) {
    const moodEntry = selected ? normalizeEntry(selected) : null;
    const sentiment = moodEntry?.body ? analyzeSentiment(moodEntry.body) : null;
    const sentimentColors = { positive: '#22c55e', negative: '#ef4444', mixed: '#f59e0b', neutral: '#9ca3af' };

    return el('div', { class: 'mood-rail' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'Mood & Analytics' }),
        el('div', { class: 'sidebar-sub', text: 'Emotional snapshot + activity' })
      ]),
      el('div', { class: 'mood-rail-body' }, [
        el('div', { class: 'mood-card' }, moodEntry ? [
          el('div', { class: 'mood-card-title', text: `${moodLabel(moodEntry.mood)} • ${moodIntensityLabel(moodEntry.moodIntensity)}` }),
          el('div', { class: 'mood-card-sub', text: moodSupport(moodEntry.mood) }),
          sentiment ? el('div', { class: 'sentiment-chip', style: `background:${sentimentColors[sentiment]}22; color:${sentimentColors[sentiment]}`, text: `Tone: ${sentiment}` }) : el('div')
        ] : [
          el('div', { class: 'mood-card-title', text: 'No entry selected' }),
          el('div', { class: 'mood-card-sub', text: 'Pick a page to view mood context.' })
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Recent pattern' }),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Top mood' }), el('span', { class: 'mood-stat-value', text: snapshot.topMood })]),
          el('div', { class: 'mood-stat-row' }, [el('span', { class: 'detail-label', text: 'Avg intensity' }), el('span', { class: 'mood-stat-value', text: snapshot.averageIntensity })])
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Mood trend' }),
          renderMoodChart()
        ]),
        el('div', { class: 'mood-card' }, [
          el('div', { class: 'mood-card-title', text: 'Writing activity' }),
          renderActivityHeatmap()
        ])
      ])
    ]);
  }

  function renderThemeRail() {
    return el('div', { class: 'theme-rail' }, [
      el('div', { class: 'sidebar-head' }, [
        el('div', { class: 'sidebar-title', text: 'Diary style' }),
        el('div', { class: 'sidebar-sub', text: 'Choose the personality of your little world' })
      ]),
      el('div', { class: 'theme-list' }, THEMES.map((theme) => el('button', {
        class: `theme-card ${state.ui.themeId === theme.id ? 'active' : ''}`,
        onclick: () => setTheme(theme.id)
      }, [
        el('div', { class: `theme-preview theme-${theme.id}` }),
        el('div', { class: 'theme-name', text: theme.name }),
        el('div', { class: 'theme-blurb', text: theme.blurb })
      ])))
    ]);
  }

  // ── Voice Dictation ────────────────────────────────────────────────────────
  function renderDictateButton(entry) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return el('div'); // Browser doesn't support it

    let recognition = null;
    let isListening = false;
    let interimTranscript = '';

    const micIcon   = el('span', { class: 'btn-ic', text: '🎤' });
    const micLabel  = el('span', { text: 'Dictate' });
    const btn       = el('button', { class: 'btn ghost small-btn dictate-btn', type: 'button' }, [micIcon, micLabel]);

    const liveBar   = el('div', { class: 'dictate-live-bar' });
    const container = el('div', { class: 'dictate-wrap' }, [btn, liveBar]);

    const setListening = (on) => {
      isListening = on;
      btn.classList.toggle('dictate-active', on);
      micIcon.textContent = on ? '⏹' : '🎤';
      micLabel.textContent = on ? 'Stop' : 'Dictate';
      if (!on) liveBar.textContent = '';
    };

    const start = () => {
      recognition = new SpeechRec();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);

      recognition.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += t;
          } else {
            interim += t;
          }
        }

        // Show interim live
        interimTranscript = interim;
        liveBar.textContent = interim ? `"${interim}"` : '';

        // Insert finalized text at caret position inside the rich editor
        if (finalText) {
          const editorEl = btn.closest('.dictate-wrap')?.previousElementSibling?.querySelector?.('.rich-editor[contenteditable]')
            || document.querySelector('.rich-editor[contenteditable]');
          if (editorEl) {
            editorEl.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.collapse(false);
              const textNode = document.createTextNode((finalText.startsWith(' ') ? '' : ' ') + finalText);
              range.insertNode(textNode);
              range.setStartAfter(textNode);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              document.execCommand('insertText', false, finalText);
            }
            editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            editorEl.scrollTop = editorEl.scrollHeight;
          }
        }
      };

      recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
          showToast('Microphone access denied. Please allow it in your browser.');
        } else if (e.error !== 'no-speech') {
          showToast(`Dictation error: ${e.error}`);
        }
        setListening(false);
      };

      recognition.onend = () => {
        // Auto-restart if user didn't explicitly stop (handles 60-second Chrome limit)
        if (isListening) {
          try { recognition.start(); } catch {}
        } else {
          setListening(false);
        }
      };

      try {
        recognition.start();
      } catch (err) {
        showToast('Could not start dictation: ' + (err?.message || 'unknown error'));
      }
    };

    const stop = () => {
      isListening = false;
      try { recognition?.stop(); } catch {}
      recognition = null;
      setListening(false);
      showToast('Dictation stopped — text saved to entry');
    };

    btn.onclick = () => {
      if (isListening) {
        stop();
      } else {
        start();
      }
    };

    return container;
  }

  function renderEditor(selected, keepEditorFocus) {
    if (!selected) {
      return el('div', { class: 'editor empty' }, [
        el('div', { class: 'empty-title', text: 'Your private world is ready.' }),
        el('div', { class: 'empty-sub', text: 'Create a page, note, letter, or recipe to begin filling it.' })
      ]);
    }

    selected = normalizeEntry(selected);

    const titleInput = el('input', {
      class: 'title-input',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:title`,
      value: selected.title || '',
      placeholder: 'Title'
    });

    const dateInput = el('input', {
      class: 'date-input',
      'data-focus-key': `entry:${selected.id}:date`,
      type: 'date',
      value: selected.date || isoDate()
    });

    const timeInput = el('input', {
      class: 'time-input',
      'data-focus-key': `entry:${selected.id}:time`,
      type: 'time',
      value: selected.time || currentTimeValue()
    });

    const typeSelect = el('select', {
      class: 'mood-select',
      'data-focus-key': `entry:${selected.id}:entryType`
    }, ENTRY_TYPE_OPTIONS.map(([value, label]) => el('option', { value, text: label })));
    typeSelect.value = selected.entryType || 'journal';

    const moodSelect = el('select', {
      class: 'mood-select',
      'data-focus-key': `entry:${selected.id}:mood`
    }, MOOD_OPTIONS.map((mood) => el('option', { value: mood, text: moodLabel(mood) })));
    moodSelect.value = selected.mood || 'sparkly';

    const privacySelect = el('select', {
      class: 'mood-select',
      'data-focus-key': `entry:${selected.id}:privacy`
    }, PRIVACY_OPTIONS.map(([value, label]) => el('option', { value, text: label })));
    privacySelect.value = selected.privacyLevel || 'private';

    const aboutInput = el('textarea', {
      class: 'meta-textarea',
      'data-focus-key': `entry:${selected.id}:about`,
      value: selected.about || '',
      placeholder: selected.moduleType === 'recipe' ? 'What memory or occasion goes with this?' : 'Who or what is this about?'
    });

    const tagsInput = el('textarea', {
      class: 'meta-textarea',
      'data-focus-key': `entry:${selected.id}:tags`,
      value: (selected.tags || []).join(', '),
      placeholder: 'Tags, separated by commas'
    });

    const folderInput = el('input', {
      class: 'meta-textarea',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:folder`,
      value: selected.folder || '',
      placeholder: 'Folder name'
    });

    const addFolderBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        const overlay = renderFolderOverlay();
        document.body.append(overlay);
      }
    }, [
      el('span', { class: 'btn-ic', text: '+' }),
      el('span', { text: 'Add folder' })
    ]);

    const recipientInput = el('input', {
      class: 'meta-textarea',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:recipient`,
      value: selected.recipient || '',
      placeholder: 'Who is this letter for?'
    });

    const letterKindSelect = el('select', {
      class: 'mood-select',
      'data-focus-key': `entry:${selected.id}:letterKind`
    }, LETTER_KIND_OPTIONS.map(([value, label]) => el('option', { value, text: label })));
    letterKindSelect.value = selected.letterKind || 'unsent';

    const sentAtInput = el('input', {
      class: 'date-input',
      'data-focus-key': `entry:${selected.id}:sentAt`,
      type: 'date',
      value: selected.sentAt || ''
    });

    const futureDeliveryDateInput = el('input', {
      class: 'date-input',
      'data-focus-key': `entry:${selected.id}:futureDeliveryDate`,
      type: 'date',
      value: selected.futureDeliveryDate || ''
    });

    const recipeCategoryInput = el('input', {
      class: 'meta-textarea',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:recipeCategory`,
      value: selected.recipeCategory || '',
      placeholder: 'Recipe category'
    });

    const prepTimeInput = el('input', {
      class: 'meta-textarea',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:prepTime`,
      value: selected.prepTime || '',
      placeholder: 'Prep time'
    });

    const servingsInput = el('input', {
      class: 'meta-textarea',
      type: 'text',
      'data-focus-key': `entry:${selected.id}:servings`,
      value: selected.servings || '',
      placeholder: 'Servings'
    });

    const ingredientsInput = el('textarea', {
      class: 'meta-textarea',
      'data-focus-key': `entry:${selected.id}:ingredients`,
      placeholder: 'One ingredient per line'
    });
    ingredientsInput.value = lineListText(selected.ingredients || []);

    const stepsInput = el('textarea', {
      class: 'meta-textarea',
      'data-focus-key': `entry:${selected.id}:steps`,
      placeholder: 'One step per line'
    });
    stepsInput.value = lineListText(selected.steps || []);

    // ── Rich WYSIWYG editor ────────────────────────────────────────────────────
    const richEditorPlaceholder = selected.moduleType === 'note'
      ? 'Jot down anything you want to keep close.'
      : selected.moduleType === 'letter'
        ? 'Write the words you want this person, future self, or memory to hold.'
        : selected.moduleType === 'recipe'
          ? 'Add little serving notes, family memories, or substitutions.'
          : 'Write anything… it stays with you.';

    const richEditor = el('div', {
      class: 'rich-editor',
      contenteditable: 'true',
      'data-placeholder': richEditorPlaceholder,
      'data-focus-key': `entry:${selected.id}:body`,
      spellcheck: 'true'
    });

    // Load existing content as formatted HTML
    richEditor.innerHTML = selected.body ? renderMarkdownToHtml(selected.body) : '';

    // Fake textarea for backward compatibility with dictation + saveAllFormChanges
    const textarea = {
      get value() { return htmlToMarkdown(richEditor.innerHTML); },
      set value(v) { richEditor.innerHTML = v ? renderMarkdownToHtml(v) : ''; },
      scrollTop: 0,
      get scrollHeight() { return richEditor.scrollHeight; },
      dispatchEvent: (e) => richEditor.dispatchEvent(e)
    };

    // Persist on every change
    richEditor.addEventListener('input', () => {
      const entry = getSelectedEntry();
      if (!entry) return;
      const md = htmlToMarkdown(richEditor.innerHTML);
      Object.assign(entry, normalizeEntry({ ...entry, body: md, updatedAt: new Date().toISOString() }));
      maybeCelebrateProgress(entry);
      persistVault();
    });

    // Keyboard shortcuts inside the editor
    richEditor.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
      else if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
      else if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
      else if (e.key === 's') { e.preventDefault(); saveAllFormChanges(); showToast('Saved'); }
    });

    // Format bar button helper
    const fmt = (icon, title, action) => {
      const btn = el('button', {
        class: 'fmt-btn',
        type: 'button',
        title
      }, [el('span', { text: icon })]);
      btn.onmousedown = (e) => {
        e.preventDefault(); // keep focus in editor
        action();
      };
      return btn;
    };

    const fmtBar = el('div', { class: 'rich-fmt-bar' }, [
      fmt('B',  'Bold (Ctrl+B)',      () => document.execCommand('bold')),
      fmt('I',  'Italic (Ctrl+I)',    () => document.execCommand('italic')),
      fmt('U',  'Underline (Ctrl+U)', () => document.execCommand('underline')),
      fmt('S̶',  'Strikethrough',      () => document.execCommand('strikethrough')),
      el('div', { class: 'fmt-divider' }),
      fmt('H1', 'Heading 1',   () => document.execCommand('formatBlock', false, 'h1')),
      fmt('H2', 'Heading 2',   () => document.execCommand('formatBlock', false, 'h2')),
      fmt('H3', 'Heading 3',   () => document.execCommand('formatBlock', false, 'h3')),
      el('div', { class: 'fmt-divider' }),
      fmt('≡',  'Bullet list',    () => document.execCommand('insertUnorderedList')),
      fmt('1.', 'Numbered list',  () => document.execCommand('insertOrderedList')),
      fmt('"',  'Blockquote',     () => document.execCommand('formatBlock', false, 'blockquote')),
      fmt('⌥',  'Code block',     () => document.execCommand('formatBlock', false, 'pre')),
      el('div', { class: 'fmt-divider' }),
      fmt('←',  'Outdent',   () => document.execCommand('outdent')),
      fmt('→',  'Indent',    () => document.execCommand('indent')),
      fmt('—',  'Paragraph', () => document.execCommand('formatBlock', false, 'p')),
      el('div', { class: 'fmt-divider' }),
      fmt('🗑', 'Clear formatting', () => document.execCommand('removeFormat'))
    ]);

    const delBtn = el('button', {
      class: 'btn danger ghost',
      onclick: () => {
        if (confirm('Move this page to trash?')) deleteEntry(selected.id);
      }
    }, [
      el('span', { class: 'btn-ic', text: '✕' }),
      el('span', { text: 'Trash' })
    ]);

    const editorToolbar = el('div'); // kept for structural compat, now empty

    const plainTextEditor = el('div', { class: 'rich-editor-wrap' }, [
      fmtBar,
      richEditor
    ]);

    // Attachments UI (images + other files)
    const attachments = Array.isArray(selected.attachments) ? selected.attachments : [];

    const attachmentsList = el('div', { class: 'attachments-list' }, attachments.map((att) => {
      const isImage = typeof att.mimeType === 'string' && att.mimeType.startsWith('image/');
      const preview = isImage && att.dataUrl
        ? el('img', { class: 'attachment-thumb', src: att.dataUrl, alt: att.name || 'Image attachment' })
        : el('div', { class: 'attachment-icon', text: (att.name || 'File').slice(0, 2).toUpperCase() });

      const nameText = el('div', { class: 'attachment-name', text: att.name || 'Attachment' });

      const openBtn = att.dataUrl
        ? el('a', {
          class: 'btn mini ghost',
          href: att.dataUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, [el('span', { text: isImage ? 'View' : 'Download' })])
        : el('div');

      const removeBtn = el('button', {
        class: 'btn mini ghost',
        type: 'button',
        onclick: () => {
          const next = attachments.filter((item) => item.id !== att.id);
          updateSelected({ attachments: next });
        }
      }, [el('span', { text: 'Remove' })]);

      return el('div', { class: 'attachment-item' }, [preview, nameText, el('div', { class: 'attachment-actions' }, [openBtn, removeBtn])]);
    }));

    const imageInput = el('input', {
      type: 'file',
      accept: 'image/*',
      multiple: 'multiple'
    });

    const MAX_ATTACHMENTS = 24;
    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

    imageInput.addEventListener('change', async () => {
      if (!imageInput.files || !imageInput.files.length) return;
      const entry = getSelectedEntry();
      if (!entry) return;
      const existing = Array.isArray(entry.attachments) ? entry.attachments : [];
      const now = new Date().toISOString();
      const next = [...existing];
      for (const file of imageInput.files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          showToast(`Skipped ${file.name}: too large (max 5MB).`);
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          showToast('Attachment limit reached for this entry.');
          break;
        }
        try {
          const dataUri = await fileToDataUri(file);
          next.push({
            id: `${entry.id}-att-${Date.now()}-${file.name}`,
            name: file.name,
            mimeType: file.type || 'image/*',
            dataUrl: dataUri,
            createdAt: now
          });
        } catch (err) {
          showToast('Failed to read image attachment');
        }
      }
      updateSelected({ attachments: next });
      imageInput.value = '';
    });

    const fileInput = el('input', {
      type: 'file',
      multiple: 'multiple'
    });

    fileInput.addEventListener('change', async () => {
      if (!fileInput.files || !fileInput.files.length) return;
      const entry = getSelectedEntry();
      if (!entry) return;
      const existing = Array.isArray(entry.attachments) ? entry.attachments : [];
      const now = new Date().toISOString();
      const next = [...existing];
      for (const file of fileInput.files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          showToast(`Skipped ${file.name}: too large (max 5MB).`);
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          showToast('Attachment limit reached for this entry.');
          break;
        }
        try {
          const dataUri = await fileToDataUri(file);
          next.push({
            id: `${entry.id}-att-${Date.now()}-${file.name}`,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: dataUri,
            createdAt: now
          });
        } catch (err) {
          showToast('Failed to read file attachment');
        }
      }
      updateSelected({ attachments: next });
      fileInput.value = '';
    });

    const attachmentsEditor = el('div', { class: 'detail-grid' }, [
      el('div', { class: 'detail-card detail-card-wide' }, [
        el('span', { class: 'detail-label', text: 'Attachments' }),
        el('div', { class: 'attachment-input-row' }, [
          el('label', { class: 'btn ghost small-btn' }, [
            el('span', { class: 'btn-ic', text: '🖼' }),
            el('span', { text: 'Add images' }),
            imageInput
          ]),
          el('label', { class: 'btn ghost small-btn' }, [
            el('span', { class: 'btn-ic', text: '📎' }),
            el('span', { text: 'Add files' }),
            fileInput
          ])
        ]),
        attachmentsList
      ])
    ]);

    const metaControls = [dateInput, timeInput, privacySelect];
    const insightChips = [
      el('div', { class: 'insight-chip', text: moduleLabel(selected.moduleType) }),
      el('div', { class: 'insight-chip', text: `${(selected.tags || []).length} tags` })
    ];
    const detailCards = [];

    if (selected.moduleType === 'diary') {
      metaControls.splice(2, 0, typeSelect, moodSelect);
      insightChips.unshift(el('div', { class: 'insight-chip', text: `${moodLabel(selected.mood)} • ${moodIntensityLabel(selected.moodIntensity)}` }));
      insightChips.push(el('div', { class: 'insight-chip', text: `About ${selected.about || 'your world'}` }));

      detailCards.push(
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Who it is about' }),
          aboutInput
        ]),
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Tags' }),
          tagsInput
        ])
      );
    }

    if (selected.moduleType === 'note') {
      metaControls.splice(2, 0, moodSelect);
      insightChips.unshift(el('div', { class: 'insight-chip', text: selected.pinned ? 'Pinned' : 'Unpinned' }));
      insightChips.push(el('div', { class: 'insight-chip', text: `Folder ${selected.folder || 'General'}` }));
      insightChips.push(el('div', { class: 'insight-chip', text: `${moodLabel(selected.mood)} • ${moodIntensityLabel(selected.moodIntensity)}` }));

      detailCards.push(
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Folder' }),
          el('div', { class: 'detail-inline' }, [folderInput, addFolderBtn])
        ]),
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'What this note is about' }),
          aboutInput
        ]),
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Tags' }),
          tagsInput
        ])
      );
    }

    if (selected.moduleType === 'letter') {
      metaControls.splice(2, 0, letterKindSelect, moodSelect);
      insightChips.unshift(el('div', { class: 'insight-chip', text: entryContextText(selected) }));
      insightChips.push(el('div', { class: 'insight-chip', text: `${moodLabel(selected.mood)} • ${moodIntensityLabel(selected.moodIntensity)}` }));
      insightChips.push(el('div', { class: 'insight-chip', text: selected.recipient ? `For ${selected.recipient}` : 'No recipient yet' }));

      detailCards.push(
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Recipient' }),
          recipientInput
        ]),
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Who or what this letter is about' }),
          aboutInput
        ]),
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Tags' }),
          tagsInput
        ]),
        selected.letterKind === 'sent'
          ? el('label', { class: 'detail-card' }, [
            el('span', { class: 'detail-label', text: 'Sent on' }),
            sentAtInput
          ])
          : selected.letterKind === 'future-self'
            ? el('label', { class: 'detail-card' }, [
              el('span', { class: 'detail-label', text: 'Open on' }),
              futureDeliveryDateInput
            ])
            : el('div', { class: 'detail-card' }, [
              el('span', { class: 'detail-label', text: 'Letter path' }),
              el('div', { class: 'insight-row' }, [el('span', { class: 'insight-chip', text: 'Keep writing from the heart' })])
            ])
      );
    }

    if (selected.moduleType === 'recipe') {
      insightChips.unshift(el('div', { class: 'insight-chip', text: selected.recipeCategory || 'Recipe' }));
      insightChips.push(el('div', { class: 'insight-chip', text: selected.prepTime || 'Prep time soon' }));
      insightChips.push(el('div', { class: 'insight-chip', text: selected.servings ? `${selected.servings} servings` : 'Servings soon' }));

      detailCards.push(
        el('label', { class: 'detail-card' }, [
          el('span', { class: 'detail-label', text: 'Recipe category' }),
          recipeCategoryInput
        ]),
        el('label', { class: 'detail-card detail-card-wide' }, [
          el('span', { class: 'detail-label', text: 'Ingredients' }),
          ingredientsInput
        ]),
        el('label', { class: 'detail-card detail-card-wide' }, [
          el('span', { class: 'detail-label', text: 'Steps' }),
          stepsInput
        ]),
        el('label', { class: 'detail-card detail-card-wide' }, [
          el('span', { class: 'detail-label', text: 'Recipe story or occasion' }),
          aboutInput
        ])
      );
    }

    const footerSummary = selected.moduleType === 'recipe'
      ? `${selected.recipeCategory || 'Recipe'} • ${selected.prepTime || 'Prep time soon'} • ${formatPrettyDate(selected.date)}`
      : selected.moduleType === 'letter'
        ? `${LETTER_KIND_OPTIONS.find(([key]) => key === selected.letterKind)?.[1] || 'Letter'} • ${selected.recipient || 'No recipient yet'} • ${formatPrettyDate(selected.date)}`
        : selected.moduleType === 'note'
          ? `Note • ${selected.folder || 'General'} • ${formatPrettyDate(selected.date)}`
          : `${entryTypeLabel(selected.entryType)} • ${selected.privacyLevel || 'private'} • ${formatPrettyDate(selected.date)}`;

    const card = el('div', { class: 'editor-card' }, [
      el('div', { class: 'editor-head' }, [
        el('div', { class: 'editor-head-left' }, [
          titleInput,
          el('div', { class: 'meta-row' }, metaControls),
          el('div', { class: 'insight-row' }, insightChips)
        ]),
        el('div', { class: 'editor-head-right' }, [delBtn])
      ]),
      el('div', { class: 'detail-grid' }, detailCards),
      plainTextEditor,
      renderVoiceMemoUI(selected),
      renderVideoUI(selected),
      attachmentsEditor,
      el('div', { class: 'editor-foot' }, [
        el('button', { class: 'btn', type: 'button', onclick: () => saveAllFormChanges() }, [
          el('span', { class: 'btn-ic', text: '♡' }),
          el('span', { text: 'Save all changes' })
        ]),
        renderDictateButton(selected),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderShareOverlay(selected) }, [
          el('span', { class: 'btn-ic', text: '🔗' }),
          el('span', { text: 'Share' })
        ]),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderTemplateOverlay() }, [
          el('span', { class: 'btn-ic', text: '📋' }),
          el('span', { text: 'Template' })
        ]),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderCommentsOverlay(selected) }, [
          el('span', { class: 'btn-ic', text: '💬' }),
          el('span', { text: 'Comments' })
        ]),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => renderFitnessOverlay(selected) }, [
          el('span', { class: 'btn-ic', text: '🏃' }),
          el('span', { text: 'Health data' })
        ]),
        el('button', {
          class: 'btn ghost small-btn', type: 'button',
          onclick: async () => {
            showToast('Getting location…');
            const loc = await captureLocationForEntry();
            if (loc) {
              updateSelected({ locationLabel: loc.locationLabel, weatherSummary: loc.weatherSummary, temperature: loc.temperature });
              showToast(`Location: ${loc.locationLabel}`);
            } else {
              showToast('Location unavailable.');
            }
          }
        }, [
          el('span', { class: 'btn-ic', text: '📍' }),
          el('span', { text: 'Add location' })
        ]),
        el('div', { class: 'tiny', text: footerSummary }),
        selected?.locationLabel ? el('div', { class: 'location-weather-chip' }, [
          el('span', { text: `📍 ${selected.locationLabel}` }),
          selected.weatherSummary ? el('span', { text: ` • ${selected.weatherSummary}` }) : el('span'),
          selected.temperature ? el('span', { text: ` ${selected.temperature}` }) : el('span')
        ]) : el('div')
      ])
    ]);

    if (state.ui.pageMotion && keepEditorFocus) card.classList.add('page-turn-card');

    if (!keepEditorFocus) {
      const active = document.activeElement;
      const isTyping = active && (active.classList?.contains('body-input') || active.classList?.contains('title-input'));
      if (isTyping) {
        setTimeout(() => {
          if (active && typeof active.focus === 'function') active.focus();
        }, 0);
      }
    }

    return el('div', { class: 'editor' }, [card]);
  }

  function renderLockScreen() {
    const hasAuthSession = Boolean(state.auth && state.auth.token && state.auth.user);
    const shouldConcealChoices = state.ui.concealVaultChoice && !state.lockVaultChoicesVisible;

    const displayName = hasAuthSession
      ? ([state.auth.user.firstName, state.auth.user.lastName].filter(Boolean).join(' ') || state.auth.user.username || state.auth.user.email)
      : '';

    const heading = el('div', {
      class: 'lock-title',
      text: hasAuthSession ? `Welcome back, ${displayName || 'lovely'}.` : 'Welcome, lovely.'
    });
    const sub = el('div', {
      class: 'lock-sub',
      text: hasAuthSession
        ? 'Enter your diary password to unlock your pages.'
        : (state.lockNotice || `Sign in to your account to open ${VAULT_SLOT_OPTIONS.find(([value]) => value === state.activeVaultSlot)?.[1] || 'your diary'}.`)
    });

    const vaultSwitcher = shouldConcealChoices
      ? el('div', { class: 'conceal-vault-row' }, [
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => revealHiddenVaultChoices() }, [
          el('span', { class: 'btn-ic', text: '⋯' }),
          el('span', { text: 'More vault options' })
        ])
      ])
      : el('div', { class: 'filter-pills' }, (state.availableVaults.length
        ? state.availableVaults.map((v) => [v.slotName, v.label])
        : VAULT_SLOT_OPTIONS)
        .filter((entry) => {
          const value = Array.isArray(entry) ? entry[0] : entry.slotName;
          return value === 'primary' || state.ui.showDecoyVault || value === state.activeVaultSlot;
        })
        .map((entry) => {
          const value = Array.isArray(entry) ? entry[0] : entry.slotName;
          const label = Array.isArray(entry) ? entry[1] : entry.label;
          return el('button', {
            class: `pill ${state.activeVaultSlot === value ? 'active' : ''}`,
            type: 'button',
            onclick: () => {
              syncVaultSlot(value);
              render(false);
            }
          }, [el('span', { text: label })]);
        }));

    const email = el('input', {
      class: 'lock-input',
      type: 'email',
      placeholder: 'Email address',
      autocomplete: 'email',
      value: hasAuthSession ? (state.auth.email || '') : ''
    });

    const pwd = el('input', {
      class: 'lock-input',
      type: 'password',
      placeholder: 'Password',
      autocomplete: 'current-password'
    });

    const status = el('div', { class: 'lock-status', text: '' });

    const signInBtn = el('button', {
      class: 'btn big',
      onclick: async () => {
        status.textContent = 'Working…';
        try {
          await unlockWithServer(email.value, pwd.value, 'login');
          showToast('Signed in');
        } catch (e) {
          status.textContent = e?.message || 'Failed';
        }
      }
    }, [
      el('span', { class: 'btn-ic', text: '♡' }),
      el('span', { text: 'Sign in' })
    ]);

    const openSignup = () => {
      const overlay = renderSignupOverlay(email.value || '', pwd.value || '');
      document.body.appendChild(overlay);
    };

    const createAccountBtn = hasAuthSession
      ? null
      : el('button', {
          class: 'btn big ghost',
          onclick: openSignup
        }, [
          el('span', { class: 'btn-ic', text: '✧' }),
          el('span', { text: 'Sign up' })
        ]);

    const cardChildren = [
      heading,
      sub,
      vaultSwitcher,
      shouldConcealChoices ? el('div', { class: 'lock-subtle', text: 'Vault choices can stay hidden until you need them.' }) : el('div')
    ];

    if (!hasAuthSession) {
      cardChildren.push(email);
    }

    cardChildren.push(
      pwd,
      signInBtn
    );

    if (createAccountBtn) {
      cardChildren.push(createAccountBtn);
    }

    cardChildren.push(status);

    if (state.deviceAuth.platformAuthenticator) {
      cardChildren.push(el('button', {
        class: 'btn ghost small-btn biometric-btn',
        type: 'button',
        onclick: () => tryBiometricUnlock()
      }, [
        el('span', { class: 'btn-ic', text: '🔏' }),
        el('span', { text: 'Use biometric / device PIN' })
      ]));
    }

    const card = el('div', { class: 'lock-card' }, cardChildren);

    const wrap = el('div', { class: 'lock' }, [
      el('div', { class: 'lock-badge' }, [
        el('div', { class: 'badge-top', text: 'account + mysql + encrypted vault' }),
        el('div', { class: 'badge-bottom', text: 'multi-user mode' })
      ]),
      card
    ]);

    setTimeout(() => {
      if (!hasAuthSession) email.focus();
      else pwd.focus();
    }, 0);
    return wrap;
  }

  (async () => {
    ['pointerdown', 'mousemove', 'keydown', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer);
    });
    await ensureSodiumReady();
    await refreshDeviceAuthSupport();
    if (state.auth.token) {
      await Promise.all([loadFoldersForUser(), loadVaultsForUser(), loadTagsForUser()]);
    }
    initDailyReminderCheck();

    const urlParams = new URLSearchParams(window.location.search);
    const capturedPrompt = urlParams.get('prompt');
    if (capturedPrompt) {
      history.replaceState(null, '', window.location.pathname);
      if (state.unlocked) {
        const newEntry = createEntry('quick');
        if (newEntry) updateSelected({ body: capturedPrompt });
      } else {
        state._pendingPrompt = capturedPrompt;
      }
    }

    render();
  })();

  // Tag management functions
  async function loadTagsForUser() {
    if (!state.auth.token) return;
    try {
      const data = await listTags(state.auth.token);
      state.tags = data.tags || [];
    } catch (error) {
      console.error('Failed to load tags:', error);
      state.tags = [];
    }
  }

  function renderTagManager() {
    const container = el('div', { class: 'tag-manager' }, [
      el('h3', { text: 'Tags' }),
      el('div', { class: 'tag-list' }, state.tags.map(tag =>
        el('div', { class: 'tag-item' }, [
          el('span', {
            class: 'tag-badge',
            style: `background-color: ${tag.color}`,
            text: tag.name
          }),
          el('button', {
            class: 'btn mini ghost',
            text: '×',
            onclick: async () => {
              try {
                await deleteTag(state.auth.token, tag.id);
                await loadTagsForUser();
                render();
              } catch (error) {
                alert('Failed to delete tag: ' + error.message);
              }
            }
          })
        ])
      )),
      el('div', { class: 'tag-create' }, [
        el('input', {
          type: 'text',
          placeholder: 'New tag name',
          id: 'new-tag-name'
        }),
        el('input', {
          type: 'color',
          value: '#6366f1',
          id: 'new-tag-color'
        }),
        el('button', {
          class: 'btn mini',
          text: 'Add',
          onclick: async () => {
            const nameInput = document.getElementById('new-tag-name');
            const colorInput = document.getElementById('new-tag-color');
            const name = nameInput.value.trim();
            const color = colorInput.value;
            if (!name) return;
            try {
              await createTag(state.auth.token, { name, color });
              await loadTagsForUser();
              nameInput.value = '';
              render();
            } catch (error) {
              alert('Failed to create tag: ' + error.message);
            }
          }
        })
      ])
    ]);
    return container;
  }

  function renderTagSelector(selectedTags = []) {
    return el('div', { class: 'tag-selector' }, [
      el('div', { class: 'tag-selector-label', text: 'Tags:' }),
      el('div', { class: 'tag-selector-list' }, state.tags.map(tag =>
        el('button', {
          class: `tag-chip ${selectedTags.includes(tag.id) ? 'selected' : ''}`,
          style: selectedTags.includes(tag.id) ? `background-color: ${tag.color}; color: white` : `background-color: ${tag.color}33; color: ${tag.color}`,
          text: tag.name,
          onclick: () => {
            // Toggle tag selection
            const index = selectedTags.indexOf(tag.id);
            if (index > -1) {
              selectedTags.splice(index, 1);
            } else {
              selectedTags.push(tag.id);
            }
            render(); // Re-render to update selection
          }
        })
      ))
    ]);
  }

  function renderEntryTags(entryTags) {
    if (!entryTags || entryTags.length === 0) return el('div');
    return el('div', { class: 'entry-tags' }, entryTags.map(tag =>
      el('span', {
        class: 'tag-badge',
        style: `background-color: ${tag.color}`,
        text: tag.name
      })
    ));
  }

  // ── Voice Memos ──────────────────────────────────────────────────────────────
  const voiceRecorderState = { mediaRecorder: null, chunks: [], recording: false };

  function renderVoiceMemoUI(entry) {
    const memos = Array.isArray(entry.voiceMemos) ? entry.voiceMemos : [];
    const statusText = el('span', { class: 'tiny', text: voiceRecorderState.recording ? 'Recording…' : '' });

    const recordBtn = el('button', {
      class: `btn ghost small-btn ${voiceRecorderState.recording ? 'active' : ''}`,
      type: 'button',
      onclick: async () => {
        if (voiceRecorderState.recording) {
          voiceRecorderState.mediaRecorder?.stop();
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          voiceRecorderState.chunks = [];
          voiceRecorderState.recording = true;
          statusText.textContent = 'Recording…';
          const mr = new MediaRecorder(stream);
          voiceRecorderState.mediaRecorder = mr;
          mr.ondataavailable = (e) => { if (e.data.size > 0) voiceRecorderState.chunks.push(e.data); };
          mr.onstop = async () => {
            voiceRecorderState.recording = false;
            statusText.textContent = '';
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(voiceRecorderState.chunks, { type: 'audio/webm' });
            if (blob.size > 10 * 1024 * 1024) { showToast('Recording too large (max 10MB).'); return; }
            const dataUrl = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result);
              reader.onerror = rej;
              reader.readAsDataURL(blob);
            });
            const cur = getSelectedEntry();
            if (!cur) return;
            const next = [...(cur.voiceMemos || []), {
              id: `vm-${Date.now()}`,
              dataUrl,
              duration: null,
              createdAt: new Date().toISOString()
            }].slice(-8);
            updateSelected({ voiceMemos: next });
          };
          mr.start();
          recordBtn.textContent = '⏹ Stop';
        } catch (err) {
          showToast('Microphone access denied or not available.');
        }
      }
    }, [el('span', { text: voiceRecorderState.recording ? '⏹ Stop' : '🎙 Record voice' })]);

    const memoList = el('div', { class: 'voice-memo-list' }, memos.map((memo, i) => {
      const audio = el('audio', { controls: 'controls', src: memo.dataUrl, class: 'voice-audio' });
      const removeBtn = el('button', {
        class: 'btn mini ghost',
        type: 'button',
        onclick: () => {
          const cur = getSelectedEntry();
          if (!cur) return;
          updateSelected({ voiceMemos: (cur.voiceMemos || []).filter((m) => m.id !== memo.id) });
        }
      }, [el('span', { text: 'Remove' })]);
      return el('div', { class: 'voice-memo-item' }, [
        el('span', { class: 'tiny', text: `Voice memo ${i + 1}` }),
        audio,
        removeBtn
      ]);
    }));

    return el('div', { class: 'detail-grid' }, [
      el('div', { class: 'detail-card detail-card-wide' }, [
        el('span', { class: 'detail-label', text: 'Voice memos' }),
        el('div', { class: 'voice-memo-controls' }, [recordBtn, statusText]),
        memoList
      ])
    ]);
  }

  // ── Video Recordings ─────────────────────────────────────────────────────────
  const videoRecorderState = { mediaRecorder: null, chunks: [], recording: false, stream: null };

  function renderVideoUI(entry) {
    const clips = Array.isArray(entry.videoClips) ? entry.videoClips : [];
    const preview = el('video', { class: 'video-preview', muted: 'muted', playsinline: 'playsinline' });
    const statusText = el('span', { class: 'tiny', text: '' });

    const recordBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: async () => {
        if (videoRecorderState.recording) {
          videoRecorderState.mediaRecorder?.stop();
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          videoRecorderState.stream = stream;
          videoRecorderState.chunks = [];
          videoRecorderState.recording = true;
          preview.srcObject = stream;
          preview.play();
          statusText.textContent = 'Recording video…';
          recordBtn.querySelector('span').textContent = '⏹ Stop';
          const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
          videoRecorderState.mediaRecorder = mr;
          mr.ondataavailable = (e) => { if (e.data.size > 0) videoRecorderState.chunks.push(e.data); };
          mr.onstop = async () => {
            videoRecorderState.recording = false;
            statusText.textContent = '';
            recordBtn.querySelector('span').textContent = '📹 Record video';
            stream.getTracks().forEach((t) => t.stop());
            preview.srcObject = null;
            const blob = new Blob(videoRecorderState.chunks, { type: 'video/webm' });
            if (blob.size > 50 * 1024 * 1024) { showToast('Video too large (max 50MB).'); return; }
            const dataUrl = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result);
              reader.onerror = rej;
              reader.readAsDataURL(blob);
            });
            const cur = getSelectedEntry();
            if (!cur) return;
            const next = [...(cur.videoClips || []), {
              id: `vc-${Date.now()}`,
              dataUrl,
              createdAt: new Date().toISOString()
            }].slice(-4);
            updateSelected({ videoClips: next });
          };
          mr.start();
        } catch (err) {
          showToast('Camera/microphone access denied or unavailable.');
        }
      }
    }, [el('span', { text: '📹 Record video' })]);

    const clipList = el('div', { class: 'video-clip-list' }, clips.map((clip, i) => {
      const video = el('video', { controls: 'controls', src: clip.dataUrl, class: 'video-clip', playsinline: 'playsinline' });
      const removeBtn = el('button', {
        class: 'btn mini ghost',
        type: 'button',
        onclick: () => {
          const cur = getSelectedEntry();
          if (!cur) return;
          updateSelected({ videoClips: (cur.videoClips || []).filter((c) => c.id !== clip.id) });
        }
      }, [el('span', { text: 'Remove' })]);
      return el('div', { class: 'video-clip-item' }, [
        el('span', { class: 'tiny', text: `Clip ${i + 1}` }),
        video,
        removeBtn
      ]);
    }));

    return el('div', { class: 'detail-grid' }, [
      el('div', { class: 'detail-card detail-card-wide' }, [
        el('span', { class: 'detail-label', text: 'Video recordings' }),
        preview,
        el('div', { class: 'voice-memo-controls' }, [recordBtn, statusText]),
        clipList
      ])
    ]);
  }

  // ── Advanced Search Overlay ──────────────────────────────────────────────────
  function renderAdvancedSearchOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const allMoods = ['sparkly', 'cozy', 'melancholy', 'anxious', 'grateful', 'hopeful', 'angry', 'peaceful', 'excited', 'numb'];

    const queryIn = el('input', { type: 'text', class: 'lock-input', placeholder: 'Search text…', value: state.searchQuery || '', style: 'font-size:14px' });

    const moodSel = el('select', { class: 'mood-select' }, [
      el('option', { value: '', text: 'Any mood' }),
      ...allMoods.map((m) => el('option', { value: m, text: moodLabel(m) }))
    ]);
    moodSel.value = state.searchFilters?.mood || '';

    const typeSel = el('select', { class: 'mood-select' }, [
      el('option', { value: '', text: 'Any type' }),
      ...ENTRY_TYPE_OPTIONS.map(([v, l]) => el('option', { value: v, text: l }))
    ]);

    const fromDate = el('input', { type: 'date', class: 'date-input', value: state.searchFilters?.fromDate || '' });
    const toDate   = el('input', { type: 'date', class: 'date-input', value: state.searchFilters?.toDate || '' });

    const tagSel = el('select', { class: 'mood-select' }, [
      el('option', { value: '', text: 'Any tag' }),
      ...(state.tags || []).map((t) => el('option', { value: String(t.id), text: t.name }))
    ]);
    tagSel.value = state.searchFilters?.tagId || '';

    const resultsEl = el('div', { class: 'search-results-list' });
    const countEl   = el('div', { class: 'tiny', text: '' });

    const doSearch = () => {
      const q = queryIn.value.trim().toLowerCase();
      const mood = moodSel.value;
      const type = typeSel.value;
      const from = fromDate.value;
      const to   = toDate.value;
      const tagId = tagSel.value;

      let results = (state.vault?.entries || []).map(normalizeEntry);
      if (q)    results = results.filter((e) => ((e.title || '') + ' ' + (e.body || '')).toLowerCase().includes(q));
      if (mood) results = results.filter((e) => e.mood === mood);
      if (type) results = results.filter((e) => e.entryType === type);
      if (from) results = results.filter((e) => e.date >= from);
      if (to)   results = results.filter((e) => e.date <= to);

      results = results.sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
      countEl.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

      resultsEl.replaceChildren(...results.slice(0, 100).map((e) => {
        const words = (e.body || '').split(/\s+/).filter(Boolean).length;
        return el('div', {
          class: 'search-result-item',
          onclick: () => {
            state.selectedId = e.id;
            state.searchFilters = { mood, fromDate: from, toDate: to, tagId };
            overlay.remove();
            render(false);
          }
        }, [
          el('div', { class: 'sr-title', text: e.title || 'Untitled' }),
          el('div', { class: 'sr-meta' }, [
            el('span', { text: e.date || '' }),
            el('span', { text: ` · ${moodLabel(e.mood)}` }),
            el('span', { text: ` · ${words}w` })
          ]),
          el('div', { class: 'sr-preview', text: summarizeBody(e.body) })
        ]);
      }));
    };

    queryIn.addEventListener('input', doSearch);
    moodSel.addEventListener('change', doSearch);
    typeSel.addEventListener('change', doSearch);
    fromDate.addEventListener('change', doSearch);
    toDate.addEventListener('change', doSearch);
    tagSel.addEventListener('change', doSearch);

    const clearBtn = el('button', {
      class: 'btn ghost small-btn', type: 'button',
      onclick: () => { queryIn.value = ''; moodSel.value = ''; typeSel.value = ''; fromDate.value = ''; toDate.value = ''; tagSel.value = ''; state.searchFilters = {}; doSearch(); }
    }, [el('span', { text: 'Clear all' })]);

    const modal = el('div', { class: 'overlay-modal overlay-wide' }, [
      el('div', { class: 'overlay-title', text: '🔍 Advanced Search' }),
      el('div', { class: 'adv-search-form' }, [
        queryIn,
        el('div', { class: 'adv-search-filters' }, [
          el('div', { class: 'adv-filter-group' }, [el('label', { class: 'adv-search-label', text: 'Mood' }), moodSel]),
          el('div', { class: 'adv-filter-group' }, [el('label', { class: 'adv-search-label', text: 'Type' }), typeSel]),
          el('div', { class: 'adv-filter-group' }, [el('label', { class: 'adv-search-label', text: 'Tag' }), tagSel]),
          el('div', { class: 'adv-filter-group' }, [el('label', { class: 'adv-search-label', text: 'From' }), fromDate]),
          el('div', { class: 'adv-filter-group' }, [el('label', { class: 'adv-search-label', text: 'To' }), toDate]),
          clearBtn
        ]),
        countEl
      ]),
      resultsEl,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    doSearch();
    setTimeout(() => queryIn.focus(), 50);
    return overlay;
  }

  // ── Calendar Overlay ─────────────────────────────────────────────────────────
  function renderCalendarOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const fmtMon = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let currentMonth = state.calendarMonth || fmtMon(new Date());

    const dayDetailEl = el('div', { class: 'cal-day-detail' });

    const showDayDetail = (iso, dayEntries) => {
      dayDetailEl.replaceChildren(
        el('div', { class: 'cal-detail-title', text: formatPrettyDate(iso) }),
        dayEntries.length === 0
          ? el('div', { class: 'tiny', text: 'No entries on this day.' })
          : el('div', { class: 'cal-day-entry-list' }, dayEntries.map((e) =>
              el('div', {
                class: 'cal-day-entry-item',
                onclick: () => {
                  state.selectedId = e.id;
                  state.calendarMonth = currentMonth;
                  overlay.remove();
                  render(false);
                }
              }, [
                el('div', { class: 'cal-day-entry-title', text: e.title || 'Untitled' }),
                el('div', { class: 'cal-day-entry-preview', text: summarizeBody(e.body) }),
                el('div', { class: 'cal-day-entry-meta', text: `${moodLabel(e.mood || '')} · ${(e.body || '').split(/\s+/).filter(Boolean).length}w` })
              ])
            ))
      );
    };

    const buildCalendar = () => {
      const now = new Date(currentMonth + '-01');
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

      const entryMap = {};
      for (const entry of (state.vault?.entries || [])) {
        const d = entry.date;
        if (d) {
          if (!entryMap[d]) entryMap[d] = [];
          entryMap[d].push(entry);
        }
      }

      const cells = [];
      for (let i = 0; i < firstDay; i++) cells.push(el('div', { class: 'cal-cell empty' }));
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayEntries = entryMap[iso] || [];
        const count = dayEntries.length;
        const isToday = iso === isoDate();

        const cell = el('div', {
          class: `cal-cell ${count ? 'has-entries' : ''} ${isToday ? 'today' : ''}`,
          onclick: () => {
            // Highlight selected
            calGrid.querySelectorAll('.cal-cell').forEach((c) => c.classList.remove('selected'));
            cell.classList.add('selected');
            showDayDetail(iso, dayEntries);
          }
        }, [
          el('span', { class: 'cal-day-num', text: String(d) }),
          ...(count ? [el('span', { class: 'cal-entry-badge', text: String(count) })] : [])
        ]);
        cells.push(cell);
      }

      const prevMonthDate = new Date(year, month - 1, 1);
      const nextMonthDate = new Date(year, month + 1, 1);

      header.replaceChildren(
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => { currentMonth = fmtMon(prevMonthDate); buildCalendar(); } }, [el('span', { text: '←' })]),
        el('span', { class: 'cal-month-label', text: monthLabel }),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => { currentMonth = fmtMon(new Date()); buildCalendar(); } }, [el('span', { text: 'Today' })]),
        el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => { currentMonth = fmtMon(nextMonthDate); buildCalendar(); } }, [el('span', { text: '→' })])
      );
      calGrid.replaceChildren(...cells);
      dayDetailEl.replaceChildren();
    };

    const header = el('div', { class: 'cal-header' });
    const calGrid = el('div', { class: 'cal-grid' });

    const modal = el('div', { class: 'overlay-modal overlay-wide overlay-calendar' }, [
      el('div', { class: 'overlay-title', text: '📅 Calendar View' }),
      header,
      el('div', { class: 'cal-weekdays' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => el('div', { class: 'cal-wday', text: d }))),
      calGrid,
      dayDetailEl,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => { state.calendarMonth = currentMonth; overlay.remove(); } }, [el('span', { text: 'Close' })])
    ]);

    overlay.append(modal);
    document.body.append(overlay);
    buildCalendar();
    return overlay;
  }

  // ── Entry Templates ──────────────────────────────────────────────────────────
  const ENTRY_TEMPLATES = [
    { id: 'daily',     icon: '📓', label: 'Daily Journal',   body: '## Morning thoughts\n\n\n## What happened today\n\n\n## Grateful for\n\n\n## Tomorrow I want to\n\n' },
    { id: 'gratitude', icon: '🙏', label: 'Gratitude',       body: '## Three things I\'m grateful for\n1. \n2. \n3. \n\n## Why I\'m grateful\n\n## One person I appreciate today\n\n' },
    { id: 'travel',    icon: '✈️', label: 'Travel Log',      body: '## Where I am\n\n## How I got here\n\n## What I saw\n\n## Food I tried\n\n## Moments to remember\n\n' },
    { id: 'dream',     icon: '🌙', label: 'Dream Log',       body: '## The dream\n\n## How it felt\n\n## People / places involved\n\n## Symbols or themes\n\n## What it might mean\n\n' },
    { id: 'weekly',    icon: '📆', label: 'Weekly Review',   body: '## Wins this week\n\n## Challenges\n\n## Lessons learned\n\n## Habits score\n\n## Next week goals\n\n' },
    { id: 'mood',      icon: '💭', label: 'Mood Check-in',   body: '## Current mood\n\n## Why I feel this way\n\n## Physical sensations\n\n## What I need right now\n\n## One thing I can do\n\n' },
    { id: 'morning',   icon: '☀️', label: 'Morning Pages',   body: '## Stream of consciousness\n\n\n\n\n## Intention for today\n\n## One thing I\'m looking forward to\n\n' },
    { id: 'evening',   icon: '🌆', label: 'Evening Reflect', body: '## How today went\n\n## Best moment\n\n## What drained me\n\n## What I\'d do differently\n\n## Tomorrow\'s priority\n\n' },
    { id: 'anxiety',   icon: '🌊', label: 'Anxiety Release', body: '## What\'s worrying me\n\n## Is this within my control?\n\n## Worst case / best case\n\n## What I can do right now\n\n## A calming reminder\n\n' },
    { id: 'letter',    icon: '✉️', label: 'Letter to Self',  body: '## Dear future me,\n\n\n\n\n## What I want you to remember\n\n## What I hope has changed\n\n## With love,\n\n' },
    { id: 'creative',  icon: '✍️', label: 'Creative Writing', body: '## Scene / setting\n\n## Character\n\n## Conflict\n\n## The story\n\n\n\n' },
    { id: 'health',    icon: '🏃', label: 'Health & Fitness', body: '## Today\'s exercise\n\n## Meals\n\n## Water intake\n\n## Sleep last night\n\n## How my body feels\n\n## Goals\n\n' }
  ];

  function renderTemplateOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const closeOverlay = () => overlay.remove();

    const applyToEntry = (tmpl) => {
      const entry = getSelectedEntry();
      if (entry) {
        if (entry.body && entry.body.trim() && !confirm('Replace the current content with this template?')) return;
        updateSelected({ body: tmpl.body, title: entry.title || tmpl.label });
        showToast(`Template "${tmpl.label}" applied`);
      } else {
        showToast('Open or create an entry first');
      }
      closeOverlay();
    };

    const createWithTemplate = (tmpl) => {
      const newId = `entry-${Date.now()}`;
      const entry = normalizeEntry({ id: newId, date: isoDate(), title: tmpl.label, body: tmpl.body, moduleType: 'diary' });
      if (!state.vault) return;
      state.vault.entries = [entry, ...(state.vault.entries || [])];
      state.selectedId = newId;
      persistVault();
      showToast(`New entry from "${tmpl.label}" template`);
      closeOverlay();
      render(false);
    };

    const cards = ENTRY_TEMPLATES.map((tmpl) =>
      el('div', { class: 'template-card' }, [
        el('div', { class: 'template-icon', text: tmpl.icon }),
        el('div', { class: 'template-name', text: tmpl.label }),
        el('div', { class: 'template-preview', text: tmpl.body.replace(/^#+\s*/gm, '').slice(0, 70) }),
        el('div', { class: 'template-actions' }, [
          el('button', { class: 'btn small-btn', type: 'button', onclick: (e) => { e.stopPropagation(); createWithTemplate(tmpl); } }, [el('span', { text: '+ New entry' })]),
          el('button', { class: 'btn ghost small-btn', type: 'button', onclick: (e) => { e.stopPropagation(); applyToEntry(tmpl); } }, [el('span', { text: 'Apply to current' })])
        ])
      ])
    );

    const modal = el('div', { class: 'overlay-modal overlay-wide' }, [
      el('div', { class: 'overlay-title', text: '📋 Entry Templates' }),
      el('div', { class: 'template-grid' }, cards),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: closeOverlay }, [el('span', { text: 'Cancel' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Analytics: Writing Stats ─────────────────────────────────────────────────
  function computeWritingStats() {
    const entries = state.vault?.entries || [];
    const total = entries.length;
    const wordCounts = entries.map((e) => (e.body || '').split(/\s+/).filter(Boolean).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    const avgWords = total ? Math.round(totalWords / total) : 0;

    const dates = [...new Set(entries.map((e) => e.date).filter(Boolean))].sort();
    let streak = 0;
    let maxStreak = 0;
    let cur = 0;
    const today = isoDate();
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dates[i];
      if (i === dates.length - 1) {
        cur = (d === today || d === yesterday) ? 1 : 0;
      } else {
        const prev = new Date(dates[i + 1]);
        const curr = new Date(d);
        const diff = Math.round((prev - curr) / 86400000);
        if (diff === 1) cur++;
        else cur = 1;
      }
      if (cur > maxStreak) maxStreak = cur;
    }
    streak = (dates[dates.length - 1] === today || dates[dates.length - 1] === yesterday) ? cur : 0;

    const monthCounts = {};
    for (const e of entries) {
      if (!e.date) continue;
      const mon = e.date.slice(0, 7);
      monthCounts[mon] = (monthCounts[mon] || 0) + 1;
    }

    return { total, totalWords, avgWords, streak, maxStreak, monthCounts };
  }

  function renderWritingStatsOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const stats = computeWritingStats();
    const months = Object.entries(stats.monthCounts).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    const maxVal = Math.max(1, ...months.map(([, v]) => v));

    const bars = months.map(([mon, count]) =>
      el('div', { class: 'stat-bar-col' }, [
        el('div', { class: 'stat-bar', style: `height:${Math.round((count / maxVal) * 80)}px`, title: `${mon}: ${count} entries` }),
        el('div', { class: 'stat-bar-label', text: mon.slice(5) }),
        el('div', { class: 'stat-bar-count', text: String(count) })
      ])
    );

    // Mood breakdown
    const entries = state.vault?.entries || [];
    const moodBreakdown = {};
    for (const e of entries) { if (e.mood) moodBreakdown[e.mood] = (moodBreakdown[e.mood] || 0) + 1; }
    const topMoods = Object.entries(moodBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const moodMax = Math.max(1, topMoods[0]?.[1] || 1);

    // Entry type breakdown
    const typeCounts = {};
    for (const e of entries) { const t = e.entryType || 'journal'; typeCounts[t] = (typeCounts[t] || 0) + 1; }
    const typeRows = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    // Longest entry
    const longest = entries.reduce((best, e) => {
      const w = (e.body || '').split(/\s+/).filter(Boolean).length;
      return w > (best.words || 0) ? { title: e.title || 'Untitled', date: e.date, words: w } : best;
    }, {});

    const modal = el('div', { class: 'overlay-modal overlay-wide' }, [
      el('div', { class: 'overlay-title', text: '📊 Writing Statistics' }),
      el('div', { class: 'stats-grid' }, [
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: String(stats.total) }), el('div', { class: 'stat-label', text: 'Total entries' })]),
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: stats.totalWords.toLocaleString() }), el('div', { class: 'stat-label', text: 'Total words' })]),
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: String(stats.avgWords) }), el('div', { class: 'stat-label', text: 'Avg words/entry' })]),
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: `${stats.streak}🔥` }), el('div', { class: 'stat-label', text: 'Current streak' })]),
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: String(stats.maxStreak) }), el('div', { class: 'stat-label', text: 'Best streak (days)' })]),
        el('div', { class: 'stat-card' }, [el('div', { class: 'stat-val', text: longest.words ? `${longest.words}w` : '—' }), el('div', { class: 'stat-label', text: longest.title ? `Longest: "${longest.title.slice(0,20)}"` : 'Longest entry' })])
      ]),
      el('div', { class: 'stats-section-label', text: 'Entries per month' }),
      el('div', { class: 'stat-chart' }, bars),
      el('div', { class: 'stats-section-label', text: 'Activity heatmap (past year)' }),
      renderActivityHeatmap(),
      el('div', { class: 'stats-section-label', text: 'Mood over recent entries' }),
      renderMoodChart(),
      el('div', { class: 'stats-section-label', text: 'Mood breakdown' }),
      el('div', { class: 'mood-breakdown-list' }, topMoods.map(([mood, count]) =>
        el('div', { class: 'mood-breakdown-row' }, [
          el('span', { class: 'mood-breakdown-label', text: moodLabel(mood) }),
          el('div', { class: 'mood-breakdown-bar-track' }, [
            el('div', { class: 'mood-breakdown-bar', style: `width:${Math.round((count / moodMax) * 100)}%` })
          ]),
          el('span', { class: 'mood-breakdown-count', text: String(count) })
        ])
      )),
      el('div', { class: 'stats-section-label', text: 'Entry types' }),
      el('div', { class: 'type-breakdown-list' }, typeRows.map(([type, count]) =>
        el('div', { class: 'mood-breakdown-row' }, [
          el('span', { class: 'mood-breakdown-label', text: entryTypeLabel(type) }),
          el('span', { class: 'mood-breakdown-count', text: String(count) })
        ])
      )),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Analytics: Activity Heatmap ──────────────────────────────────────────────
  function renderActivityHeatmap() {
    const entries = state.vault?.entries || [];
    const dateCounts = {};
    for (const e of entries) {
      if (e.date) dateCounts[e.date] = (dateCounts[e.date] || 0) + 1;
    }
    const maxVal = Math.max(1, ...Object.values(dateCounts));

    const today = new Date();
    const cells = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const count = dateCounts[iso] || 0;
      const intensity = count === 0 ? 0 : Math.ceil((count / maxVal) * 4);
      cells.push(el('div', {
        class: `heatmap-cell intensity-${intensity}`,
        title: `${iso}: ${count} entr${count === 1 ? 'y' : 'ies'}`
      }));
    }

    return el('div', { class: 'heatmap-wrap' }, [
      el('div', { class: 'heatmap-grid' }, cells),
      el('div', { class: 'heatmap-legend' }, [
        el('span', { class: 'tiny', text: 'Less' }),
        ...[0,1,2,3,4].map((i) => el('div', { class: `heatmap-cell intensity-${i}` })),
        el('span', { class: 'tiny', text: 'More' })
      ])
    ]);
  }

  // ── Mood Chart ───────────────────────────────────────────────────────────────
  function renderMoodChart() {
    const entries = sortEntriesDesc(state.vault?.entries || []).slice(0, 30).reverse();
    if (!entries.length) return el('div', { class: 'tiny', text: 'No entries yet.' });
    const moodColors = {
      sparkly: '#f59e0b', cozy: '#f97316', melancholy: '#6366f1',
      anxious: '#ef4444', grateful: '#22c55e', hopeful: '#3b82f6',
      angry: '#dc2626', peaceful: '#10b981', excited: '#a855f7', numb: '#9ca3af'
    };
    const max = 5;
    const bars = entries.map((e) => {
      const intensity = e.moodIntensity || 3;
      const color = moodColors[e.mood] || '#6366f1';
      return el('div', { class: 'mood-bar-col' }, [
        el('div', {
          class: 'mood-bar',
          style: `height:${Math.round((intensity / max) * 60)}px; background:${color}`,
          title: `${e.date}: ${moodLabel(e.mood)} (${intensity})`
        }),
        el('div', { class: 'mood-bar-dot', style: `background:${color}` })
      ]);
    });
    return el('div', { class: 'mood-chart-wrap' }, [
      el('div', { class: 'mood-chart', title: 'Mood over last 30 entries' }, bars),
      el('div', { class: 'mood-chart-label', text: 'Mood over recent entries' })
    ]);
  }

  // ── Sentiment Analysis ───────────────────────────────────────────────────────
  const POSITIVE_WORDS = new Set(['happy','love','great','amazing','wonderful','joy','grateful','excited','peaceful','beautiful','hope','inspired','proud','calm','content','blessed','thankful','kind','gentle','warm','bright','fun','laugh','smile']);
  const NEGATIVE_WORDS = new Set(['sad','angry','hate','terrible','awful','anxious','worried','fear','hurt','pain','tired','exhausted','frustrated','lonely','lost','dark','heavy','hard','cry','stress','bad','wrong','fail']);

  function analyzeSentiment(text = '') {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    let pos = 0, neg = 0;
    for (const w of words) {
      if (POSITIVE_WORDS.has(w)) pos++;
      else if (NEGATIVE_WORDS.has(w)) neg++;
    }
    const total = pos + neg;
    if (!total) return 'neutral';
    const ratio = pos / total;
    if (ratio >= 0.7) return 'positive';
    if (ratio <= 0.3) return 'negative';
    return 'mixed';
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function exportToJson() {
    const data = JSON.stringify(state.vault?.entries || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mydiary-export-${isoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as JSON');
  }

  function exportToMarkdown() {
    const entries = sortEntriesDesc(state.vault?.entries || []);
    const md = entries.map((e) => {
      const lines = [`# ${e.title || 'Untitled'} — ${e.date || ''}`, ''];
      if (e.mood) lines.push(`**Mood:** ${moodLabel(e.mood)}  `);
      if (e.tags?.length) lines.push(`**Tags:** ${e.tags.join(', ')}  `);
      lines.push('');
      if (e.body) lines.push(e.body);
      lines.push('\n---\n');
      return lines.join('\n');
    }).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mydiary-export-${isoDate()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as Markdown');
  }

  function exportToPdf() {
    const entries = sortEntriesDesc(state.vault?.entries || []);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>My Diary Export</title>
    <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#111}h1{font-size:1.4em;margin-top:2em}
    .meta{font-size:.85em;color:#555;margin-bottom:.5em}.body{white-space:pre-wrap;line-height:1.7}hr{border:none;border-top:1px solid #ddd;margin:2em 0}</style>
    </head><body>` +
      entries.map((e) => `<h1>${e.title || 'Untitled'}</h1><div class="meta">${e.date || ''} ${e.mood ? '• ' + moodLabel(e.mood) : ''}</div><div class="body">${e.body || ''}</div><hr>`).join('') +
      '</body></html>';
    const win = window.open('', '_blank');
    if (!win) { showToast('Allow pop-ups to export PDF'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
    showToast('Print dialog opened — save as PDF');
  }

  function exportToCsv() {
    const entries = sortEntriesDesc(state.vault?.entries || []);
    const header = 'Date,Title,Mood,Words,Type,Tags';
    const rows = entries.map((e) => [
      e.date || '',
      `"${(e.title || '').replace(/"/g, '\'\'')}"`  ,
      moodLabel(e.mood || ''),
      (e.body || '').split(/\s+/).filter(Boolean).length,
      e.entryType || 'journal',
      `"${(e.tags || []).join(', ')}"`
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mydiary-export-${isoDate()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported as CSV');
  }

  function renderExportOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const total = (state.vault?.entries || []).length;
    const totalWords = (state.vault?.entries || []).reduce((s, e) => s + (e.body || '').split(/\s+/).filter(Boolean).length, 0);

    const exportOption = (icon, title, desc, action) =>
      el('div', { class: 'export-option-card' }, [
        el('div', { class: 'export-option-icon', text: icon }),
        el('div', { class: 'export-option-info' }, [
          el('div', { class: 'export-option-title', text: title }),
          el('div', { class: 'export-option-desc', text: desc })
        ]),
        el('button', { class: 'btn small-btn', type: 'button', onclick: () => { action(); overlay.remove(); } }, [el('span', { text: 'Export' })])
      ]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: '⬇️ Export Diary' }),
      el('div', { class: 'export-summary', text: `${total} entries · ${totalWords.toLocaleString()} words` }),
      el('div', { class: 'export-options-list' }, [
        exportOption('{}', 'JSON', 'Full data with all fields. Best for backups or re-importing.', exportToJson),
        exportOption('MD', 'Markdown', 'Readable text format. Opens in any text editor or Notion.', exportToMarkdown),
        exportOption('📄', 'PDF / Print', 'Opens a print dialog — choose Save as PDF.', exportToPdf),
        exportOption('📊', 'CSV', 'Spreadsheet format. Date, title, mood, word count per row.', exportToCsv)
      ]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Cancel' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Reminders & Notifications ─────────────────────────────────────────────────
  function initDailyReminderCheck() {
    const prefs = loadUiPrefs() || {};
    if (!prefs.reminderEnabled) return;
    const now = new Date();
    const [rh, rm] = (prefs.reminderTime || '20:00').split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rh, rm, 0, 0);
    let delay = target - now;
    if (delay < 0) delay += 86400000;
    setTimeout(() => {
      if (document.visibilityState === 'visible') {
        showToast('🔔 Time to write in your diary!');
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('MyDiary reminder', { body: 'Time to write in your diary!', icon: '/favicon.ico' });
      }
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          showToast('🔔 Time to write in your diary!');
        } else if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('MyDiary reminder', { body: 'Time to write in your diary!', icon: '/favicon.ico' });
        }
      }, 86400000);
    }, delay);
  }

  function renderReminderSettings() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const prefs = loadUiPrefs() || {};

    const enabledToggle = el('input', { type: 'checkbox', id: 'reminder-toggle' });
    enabledToggle.checked = Boolean(prefs.reminderEnabled);

    const timeInput = el('input', { type: 'time', class: 'date-input', value: prefs.reminderTime || '20:00' });

    const saveBtn = el('button', {
      class: 'btn',
      type: 'button',
      onclick: async () => {
        const updPrefs = { ...(loadUiPrefs() || {}), reminderEnabled: enabledToggle.checked, reminderTime: timeInput.value };
        saveUiPrefs(updPrefs);
        if (enabledToggle.checked && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        overlay.remove();
        showToast('Reminder settings saved');
        if (enabledToggle.checked) initDailyReminderCheck();
      }
    }, [el('span', { text: 'Save reminder' })]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Daily reminder' }),
      el('label', { class: 'account-row' }, [
        el('input', { type: 'checkbox', id: 'reminder-toggle-chk' }),
        el('span', { class: 'account-label', text: 'Enable daily reminder' })
      ]),
      el('div', { class: 'account-row' }, [
        el('span', { class: 'account-label', text: 'Remind me at' }),
        timeInput
      ]),
      saveBtn,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Cancel' })])
    ]);

    const chk = modal.querySelector('#reminder-toggle-chk');
    if (chk) chk.checked = Boolean(prefs.reminderEnabled);

    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Goals & Milestones ────────────────────────────────────────────────────────
  function loadGoals() {
    try { return JSON.parse(localStorage.getItem('diary.goals') || '[]'); } catch { return []; }
  }
  function saveGoals(goals) {
    localStorage.setItem('diary.goals', JSON.stringify(goals));
  }

  function renderGoalsOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    let goals = loadGoals();

    const refreshList = () => {
      list.replaceChildren(...goals.map((g) => {
        const progress = el('div', {
          class: 'goal-progress-bar',
          style: `width:${Math.min(100, Math.round((g.current / Math.max(1, g.target)) * 100))}%`
        });
        const pct = el('span', { class: 'tiny', text: `${g.current}/${g.target} entries` });
        const doneBtn = el('button', {
          class: 'btn mini ghost',
          type: 'button',
          onclick: () => {
            g.current = Math.min(g.target, g.current + 1);
            saveGoals(goals);
            refreshList();
          }
        }, [el('span', { text: '+1' })]);
        const delBtn = el('button', {
          class: 'btn mini ghost',
          type: 'button',
          onclick: () => {
            goals = goals.filter((x) => x.id !== g.id);
            saveGoals(goals);
            refreshList();
          }
        }, [el('span', { text: '✕' })]);
        return el('div', { class: 'goal-item' }, [
          el('div', { class: 'goal-name', text: g.name }),
          el('div', { class: 'goal-progress-track' }, [progress]),
          el('div', { class: 'goal-row' }, [pct, doneBtn, delBtn])
        ]);
      }));
    };

    const list = el('div', { class: 'goals-list' });
    refreshList();

    const nameInput = el('input', { type: 'text', class: 'lock-input', placeholder: 'Goal name', style: 'font-size:13px' });
    const targetInput = el('input', { type: 'number', class: 'date-input', placeholder: 'Target (entries)', value: '30' });

    const addBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: () => {
        const name = nameInput.value.trim();
        if (!name) return;
        goals.push({ id: `goal-${Date.now()}`, name, target: Number(targetInput.value) || 30, current: 0, createdAt: new Date().toISOString() });
        saveGoals(goals);
        nameInput.value = '';
        refreshList();
      }
    }, [el('span', { text: 'Add goal' })]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Goals & Milestones' }),
      list,
      el('div', { class: 'goal-add-row' }, [nameInput, targetInput, addBtn]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Share Entry ───────────────────────────────────────────────────────────────
  function renderShareOverlay(entry) {
    if (!entry) return;
    const overlay = el('div', { class: 'overlay-backdrop' });
    const shareId = btoa(entry.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
    const shareUrl = `${window.location.origin}/share/${shareId}`;
    const urlInput = el('input', { type: 'text', class: 'lock-input', value: shareUrl, readonly: 'readonly', style: 'font-size:12px' });
    const copyBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => {
        navigator.clipboard?.writeText(shareUrl).then(() => showToast('Link copied!')).catch(() => {
          urlInput.select();
          document.execCommand('copy');
          showToast('Link copied!');
        });
      }
    }, [el('span', { text: 'Copy link' })]);
    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Share this entry' }),
      el('div', { class: 'share-notice', text: 'Note: sharing requires the shared link feature to be enabled on your server. For now this generates a shareable ID for your records.' }),
      el('div', { class: 'share-url-row' }, [urlInput, copyBtn]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Location & Weather ─────────────────────────────────────────────────────────
  async function captureLocationForEntry() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
          let weatherSummary = '';
          let temperature = '';
          try {
            const key = state.integrationConfig?.openweather_api_key || '';
            if (key) {
              const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${key}&units=metric`);
              const d = await r.json();
              label = `${d.name || label}, ${d.sys?.country || ''}`.trim().replace(/,\s*$/, '');
              weatherSummary = d.weather?.[0]?.description || '';
              temperature = d.main?.temp != null ? `${Math.round(d.main.temp)}°C` : '';
            }
          } catch { /* graceful */ }
          resolve({ locationLabel: label, weatherSummary, temperature, lat: latitude, lon: longitude });
        },
        () => resolve(null)
      );
    });
  }

  // ── Habit Tracking ────────────────────────────────────────────────────────────
  const HABIT_STORAGE_KEY = 'diary.habits';

  function loadHabits() {
    try { return JSON.parse(localStorage.getItem(HABIT_STORAGE_KEY) || '[]'); } catch { return []; }
  }

  function saveHabits(habits) {
    localStorage.setItem(HABIT_STORAGE_KEY, JSON.stringify(habits));
  }

  function renderHabitOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    let habits = loadHabits();
    const todayIso = isoDate();

    const refreshHabits = () => {
      habitList.replaceChildren(...habits.map((h) => {
        const completedToday = (h.completedDates || []).includes(todayIso);
        const streak = calcHabitStreak(h.completedDates || []);
        const checkBtn = el('button', {
          class: `btn small-btn ${completedToday ? '' : 'ghost'}`,
          type: 'button',
          onclick: () => {
            if (!completedToday) {
              h.completedDates = [...(h.completedDates || []), todayIso];
            } else {
              h.completedDates = (h.completedDates || []).filter((d) => d !== todayIso);
            }
            saveHabits(habits);
            refreshHabits();
          }
        }, [el('span', { text: completedToday ? '✓ Done today' : 'Mark done' })]);
        const delBtn = el('button', {
          class: 'btn mini ghost',
          type: 'button',
          onclick: () => { habits = habits.filter((x) => x.id !== h.id); saveHabits(habits); refreshHabits(); }
        }, [el('span', { text: '✕' })]);
        return el('div', { class: 'habit-item' }, [
          el('div', { class: 'habit-name', text: h.name }),
          el('div', { class: 'habit-meta', text: `🔥 ${streak} day streak` }),
          el('div', { class: 'habit-actions' }, [checkBtn, delBtn])
        ]);
      }));
    };

    const habitList = el('div', { class: 'habits-list' });
    refreshHabits();

    const nameIn = el('input', { type: 'text', class: 'lock-input', placeholder: 'New habit name', style: 'font-size:13px' });
    const addBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: () => {
        const name = nameIn.value.trim();
        if (!name) return;
        habits.push({ id: `hab-${Date.now()}`, name, completedDates: [], createdAt: new Date().toISOString() });
        saveHabits(habits);
        nameIn.value = '';
        refreshHabits();
      }
    }, [el('span', { text: 'Add habit' })]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Habit Tracker' }),
      habitList,
      el('div', { class: 'goal-add-row' }, [nameIn, addBtn]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  function calcHabitStreak(dates) {
    if (!dates.length) return 0;
    const sorted = [...dates].sort().reverse();
    let streak = 0;
    let cursor = new Date(isoDate());
    for (const d of sorted) {
      const dDate = new Date(d);
      const diff = Math.round((cursor.getTime() - dDate.getTime()) / 86400000);
      if (diff === 0 || diff === 1) { streak++; cursor = dDate; }
      else break;
    }
    return streak;
  }

  // ── Collaborative Journals ─────────────────────────────────────────────────────
  function renderCollabOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Collaborative Journals' }),
      el('div', { class: 'share-notice', text: 'Collaborative journals let you invite others to co-write a shared diary. This feature is coming soon — invite your collaborators by sharing your journal link below.' }),
      el('div', { class: 'collab-invite-row' }, [
        el('input', { type: 'text', class: 'lock-input', placeholder: 'Collaborator email', style: 'font-size:13px' }),
        el('button', { class: 'btn small-btn', type: 'button', onclick: () => showToast('Invite sent! (Collaborative journals coming soon)') }, [el('span', { text: 'Invite' })])
      ]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Comment System ─────────────────────────────────────────────────────────────
  function renderCommentsOverlay(entry) {
    if (!entry) return;
    const overlay = el('div', { class: 'overlay-backdrop' });
    const COMMENTS_KEY = `diary.comments.${entry.id}`;
    let comments = [];
    try { comments = JSON.parse(localStorage.getItem(COMMENTS_KEY) || '[]'); } catch { comments = []; }

    const listEl = el('div', { class: 'comments-list' });
    const refreshComments = () => {
      listEl.replaceChildren(...comments.map((c) => el('div', { class: 'comment-item' }, [
        el('span', { class: 'comment-author', text: c.author || 'You' }),
        el('span', { class: 'comment-time', text: new Date(c.createdAt).toLocaleString() }),
        el('div', { class: 'comment-body', text: c.text })
      ])));
    };
    refreshComments();

    const textIn = el('textarea', { class: 'body-input', placeholder: 'Write a comment…', rows: '3', style: 'font-size:13px; min-height:60px' });
    const submitBtn = el('button', {
      class: 'btn small-btn',
      type: 'button',
      onclick: () => {
        const text = textIn.value.trim();
        if (!text) return;
        comments.push({ id: `cmt-${Date.now()}`, author: state.auth?.user?.username || 'You', text, createdAt: new Date().toISOString() });
        localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
        textIn.value = '';
        refreshComments();
      }
    }, [el('span', { text: 'Post comment' })]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Comments' }),
      listEl,
      textIn,
      submitBtn,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Social Feed ────────────────────────────────────────────────────────────────
  function renderSocialFeedOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const publicEntries = (state.vault?.entries || [])
      .map(normalizeEntry)
      .filter((e) => e.privacyLevel === 'shared')
      .slice(0, 20);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Public / Shared Feed' }),
      el('div', { class: 'share-notice', text: 'Entries marked as "shared" privacy appear here as your personal public feed.' }),
      el('div', { class: 'social-feed-list' }, publicEntries.length
        ? publicEntries.map((e) => el('div', { class: 'social-feed-item', onclick: () => { state.selectedId = e.id; overlay.remove(); render(false); } }, [
          el('div', { class: 'feed-item-title', text: e.title || 'Untitled' }),
          el('div', { class: 'feed-item-preview', text: summarizeBody(e.body) }),
          el('div', { class: 'feed-item-meta', text: e.date || '' })
        ]))
        : [el('div', { class: 'tiny', text: 'No shared entries yet. Set an entry\'s privacy to "Shared" to see it here.' })]
      ),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Biometric Unlock ───────────────────────────────────────────────────────────
  async function tryBiometricUnlock() {
    if (!state.deviceAuth.supported || !state.deviceAuth.platformAuthenticator) {
      showToast('Biometric authentication not available on this device.');
      return;
    }
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname,
          userVerification: 'required',
          timeout: 30000
        }
      });
      if (credential) {
        showToast('Biometric check passed. Enter your diary password to continue.');
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast('Biometric authentication failed.');
      }
    }
  }

  // ── Browser Extension Quick-Capture Overlay ────────────────────────────────────
  function renderExtensionGuide() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Browser Extension — Quick Capture' }),
      el('div', { class: 'share-notice', text: 'Install the MyDiary browser extension to quickly capture thoughts from any webpage. The extension bookmarklet below can be dragged to your bookmarks bar as a quick workaround.' }),
      el('div', { class: 'extension-step' }, [
        el('div', { class: 'extension-step-num', text: '1' }),
        el('div', { text: 'Drag this to your bookmarks bar:' }),
        el('a', {
          class: 'extension-bookmarklet',
          href: `javascript:(function(){window.open('${window.location.origin}?prompt='+encodeURIComponent(window.getSelection().toString()||document.title),'_blank');})();`,
          text: '📖 Save to Diary'
        })
      ]),
      el('div', { class: 'extension-step' }, [
        el('div', { class: 'extension-step-num', text: '2' }),
        el('div', { text: 'When browsing, click the bookmarklet to open MyDiary with the selected text pre-filled as a new entry prompt.' })
      ]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Calendar Sync Guide ────────────────────────────────────────────────────────
  function renderCalendarSyncOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const exportIcal = () => {
      const entries = (state.vault?.entries || []).map(normalizeEntry);
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//MyDiary//EN',
        'CALSCALE:GREGORIAN'
      ];
      for (const e of entries) {
        if (!e.date) continue;
        const dtStart = e.date.replace(/-/g, '') + (e.time ? 'T' + e.time.replace(':', '') + '00' : '');
        lines.push('BEGIN:VEVENT');
        lines.push(`DTSTART${e.time ? '' : ';VALUE=DATE'}:${dtStart}`);
        lines.push(`SUMMARY:${(e.title || 'Diary entry').replace(/[,;]/g, ' ')}`);
        lines.push(`DESCRIPTION:${(e.body || '').slice(0, 200).replace(/\n/g, '\\n').replace(/[,;]/g, ' ')}`);
        lines.push('END:VEVENT');
      }
      lines.push('END:VCALENDAR');
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'mydiary.ics'; a.click();
      URL.revokeObjectURL(url);
      showToast('Calendar file downloaded');
    };

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Calendar Sync' }),
      el('div', { class: 'share-notice', text: 'Export your diary entries as an iCal (.ics) file to import into Google Calendar, Outlook, Apple Calendar, or any calendar app.' }),
      el('button', { class: 'btn', type: 'button', onclick: exportIcal }, [
        el('span', { class: 'btn-ic', text: '📅' }),
        el('span', { text: 'Download .ics calendar file' })
      ]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Fitness / Health Data ──────────────────────────────────────────────────────
  function renderFitnessOverlay(entry) {
    if (!entry) return;
    const overlay = el('div', { class: 'overlay-backdrop' });
    const cur = normalizeEntry(entry);

    const stepsIn = el('input', { type: 'number', class: 'date-input', placeholder: 'Steps today', value: cur.steps || '' });
    const hrIn = el('input', { type: 'number', class: 'date-input', placeholder: 'Heart rate (bpm)', value: cur.heartRate || '' });
    const weightIn = el('input', { type: 'number', class: 'date-input', placeholder: 'Weight (kg)', value: cur.weight || '' });
    const sleepIn = el('input', { type: 'number', class: 'date-input', placeholder: 'Sleep hours', value: cur.sleepHours || '' });

    const saveBtn = el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        updateSelected({
          steps: stepsIn.value ? Number(stepsIn.value) : '',
          heartRate: hrIn.value || '',
          weight: weightIn.value || '',
          sleepHours: sleepIn.value || ''
        });
        showToast('Health data saved');
        overlay.remove();
      }
    }, [el('span', { text: 'Save health data' })]);

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Fitness & Health Data' }),
      el('div', { class: 'fitness-grid' }, [
        el('label', { class: 'tiny', text: 'Steps' }), stepsIn,
        el('label', { class: 'tiny', text: 'Heart rate (bpm)' }), hrIn,
        el('label', { class: 'tiny', text: 'Weight (kg)' }), weightIn,
        el('label', { class: 'tiny', text: 'Sleep (hours)' }), sleepIn
      ]),
      saveBtn,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Audit Log Viewer ──────────────────────────────────────────────────────────
  function renderAuditLogOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const list = el('div', { class: 'audit-log-list' });
    const statusText = el('div', { class: 'tiny', text: 'Loading…' });

    (async () => {
      try {
        const data = await getAuditLogs(state.auth.token, 100);
        const logs = data.logs || [];
        if (!logs.length) {
          list.append(el('div', { class: 'tiny', text: 'No activity recorded yet.' }));
        } else {
          list.replaceChildren(...logs.map((log) => {
            const dt = new Date(log.created_at);
            return el('div', { class: 'audit-row' }, [
              el('span', { class: 'audit-action', text: log.action }),
              el('span', { class: 'audit-detail', text: log.detail || '' }),
              el('span', { class: 'audit-time', text: dt.toLocaleString() }),
              log.ip_address ? el('span', { class: 'audit-ip', text: log.ip_address }) : el('span')
            ]);
          }));
        }
        statusText.textContent = `${logs.length} events`;
      } catch {
        statusText.textContent = 'Failed to load audit logs.';
      }
    })();

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Security audit log' }),
      statusText,
      list,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── 2FA Setup Overlay ─────────────────────────────────────────────────────────
  function renderTwoFactorOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const statusDiv = el('div', { class: 'tiny', text: '' });

    const secretInput = el('input', { type: 'text', class: 'lock-input', placeholder: 'TOTP secret key (e.g. from authenticator app)', style: 'font-size:12px' });

    const enableChk = el('input', { type: 'checkbox', id: 'totp-enable-chk' });

    const saveBtn = el('button', {
      class: 'btn',
      type: 'button',
      onclick: async () => {
        const secret = secretInput.value.trim();
        if (!secret) { statusDiv.textContent = 'Secret is required.'; return; }
        try {
          await setup2fa(state.auth.token, { secret, enabled: enableChk.checked });
          statusDiv.textContent = '2FA settings saved.';
          showToast('2FA settings saved');
          setTimeout(() => overlay.remove(), 1200);
        } catch (err) {
          statusDiv.textContent = err?.message || 'Failed to save.';
        }
      }
    }, [el('span', { text: 'Save 2FA settings' })]);

    (async () => {
      try {
        const status = await get2faStatus(state.auth.token);
        statusDiv.textContent = status.enabled ? '2FA is currently ENABLED.' : '2FA is currently disabled.';
        enableChk.checked = Boolean(status.enabled);
      } catch { statusDiv.textContent = 'Could not load current status.'; }
    })();

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Two-factor authentication (2FA)' }),
      el('div', { class: 'tiny', text: 'Enter the TOTP secret from your authenticator app (e.g. Google Authenticator, Authy). Toggle to enable.' }),
      secretInput,
      el('label', { class: 'account-row' }, [
        enableChk,
        el('span', { class: 'account-label', text: 'Enable 2FA' })
      ]),
      saveBtn,
      statusDiv,
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Cancel' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Recovery Codes Overlay ────────────────────────────────────────────────────
  function renderRecoveryCodesOverlay() {
    const overlay = el('div', { class: 'overlay-backdrop' });
    const statusDiv = el('div', { class: 'tiny', text: '' });
    const codeList = el('div', { class: 'recovery-codes-list' });

    const generateCodes = () => {
      const codes = Array.from({ length: 8 }, () =>
        Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 4)).join('-')
      );
      codeList.replaceChildren(
        el('div', { class: 'tiny', text: 'Save these codes securely. Each can be used once.' }),
        ...codes.map((c) => el('div', { class: 'recovery-code', text: c }))
      );
      return codes;
    };

    let codes = generateCodes();

    const saveBtn = el('button', {
      class: 'btn',
      type: 'button',
      onclick: async () => {
        const codesHash = btoa(codes.join('|'));
        try {
          await saveRecoveryCodes(state.auth.token, codesHash);
          statusDiv.textContent = 'Recovery codes saved.';
          showToast('Recovery codes saved');
          setTimeout(() => overlay.remove(), 1500);
        } catch (err) {
          statusDiv.textContent = err?.message || 'Failed to save.';
        }
      }
    }, [el('span', { text: 'Save recovery codes' })]);

    const regenBtn = el('button', {
      class: 'btn ghost small-btn',
      type: 'button',
      onclick: () => { codes = generateCodes(); }
    }, [el('span', { text: 'Regenerate' })]);

    (async () => {
      try {
        const status = await getRecoveryStatus(state.auth.token);
        statusDiv.textContent = status.hasRecoveryCodes
          ? `Recovery codes last saved: ${status.createdAt ? new Date(status.createdAt).toLocaleDateString() : 'unknown'}`
          : 'No recovery codes saved yet.';
      } catch { /* silent */ }
    })();

    const modal = el('div', { class: 'overlay-modal' }, [
      el('div', { class: 'overlay-title', text: 'Account recovery codes' }),
      statusDiv,
      codeList,
      el('div', { class: 'recovery-actions' }, [saveBtn, regenBtn]),
      el('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => overlay.remove() }, [el('span', { text: 'Close' })])
    ]);
    overlay.append(modal);
    document.body.append(overlay);
    return overlay;
  }

  // ── Daily Writing Prompts ─────────────────────────────────────────────────────
  function getTodaysPrompt() {
    const prompts = [
      'What made you smile today?',
      'Describe a moment you want to remember forever.',
      'What is something you are grateful for right now?',
      'Write about a challenge you overcame recently.',
      'What would your future self thank you for today?',
      'Describe the most interesting person you know.',
      'What is something you want to learn or try?',
      'Write about a place that brings you peace.',
      'What emotions are you carrying today?',
      'If today were a chapter in your life story, what would it be called?',
      'What small thing brought unexpected joy recently?',
      'Describe your perfect day from morning to night.',
      'What is something you want to let go of?',
      'Write a letter to someone who shaped who you are.',
      'What are three things that went well today?'
    ];
    const idx = new Date().getDate() % prompts.length;
    return prompts[idx];
  }
}
