const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
const apiBasePointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawApiBaseUrl);
const browserIsLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(browserHost);
const API_BASE_URL = apiBasePointsToLocalhost && !browserIsLocalhost ? '' : rawApiBaseUrl;

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const fetchOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };
  const response = await fetch(url, fetchOptions);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function registerUser(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listFolders(token, vaultSlot = 'primary') {
  return request(`/api/folders?vaultSlot=${encodeURIComponent(vaultSlot)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function createFolder(token, payload) {
  return request('/api/folders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function updateFolder(token, folderId, payload) {
  return request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteFolder(token, folderId) {
  return request(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function verifyFolderPassword(token, folderId, password, vaultSlot = 'primary') {
  return request(`/api/folders/${encodeURIComponent(folderId)}/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ password, vaultSlot })
  });
}

export async function listVaults(token) {
  return request('/api/vaults', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createVault(token, payload) {
  return request('/api/vaults', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function updateVault(token, slotName, payload) {
  return request(`/api/vaults/${encodeURIComponent(slotName)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function deleteVault(token, slotName) {
  return request(`/api/vaults/${encodeURIComponent(slotName)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function verifyVaultPassword(token, slot, password) {
  return request(`/api/vaults/${slot}/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ password })
  });
}

// Tag API functions
export async function listTags(token) {
  return request('/api/tags', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function createTag(token, payload) {
  return request('/api/tags', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function updateTag(token, tagId, payload) {
  return request(`/api/tags/${tagId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteTag(token, tagId) {
  return request(`/api/tags/${tagId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function getEntryTags(token, slot) {
  return request(`/api/entries/${slot}/tags`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function addTagToEntry(token, slot, tagId) {
  return request(`/api/entries/${slot}/tags/${tagId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function removeTagFromEntry(token, slot, tagId) {
  return request(`/api/entries/${slot}/tags/${tagId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function getEntriesByTag(token, tagId) {
  return request(`/api/tags/${tagId}/entries`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function adminGetUser(token, userId) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function adminUpdateUser(token, userId, payload) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function loginUser(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function loadVaultFromServer(token, slot = 'primary') {
  return request(`/api/vault/${encodeURIComponent(slot)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function changePassword(token, currentPassword, newPassword) {
  return request('/api/auth/change-password', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function adminListUsers(token, limit = 200) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  return request(`/api/admin/users?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function adminSetUserAdmin(token, userId, isAdmin) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/admin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ isAdmin })
  });
}

export async function adminDeleteUser(token, userId) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function adminGetSiteSummary(token) {
  return request('/api/admin/site-summary', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminGetStats(token) {
  return request('/api/admin/stats', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminGetAuditLogs(token, limit = 100, userId = null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (userId) params.set('userId', String(userId));
  return request(`/api/admin/audit-logs?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminGetSiteSettings(token) {
  return request('/api/admin/site-settings', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminSaveSiteSettings(token, payload) {
  return request('/api/admin/site-settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function adminResetUserPassword(token, userId, newPassword) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newPassword })
  });
}

export async function adminSuspendUser(token, userId, suspended) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ suspended })
  });
}

export async function adminGetRecentRegistrations(token, limit = 10) {
  return request(`/api/admin/recent-registrations?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminListInviteCodes(token) {
  return request('/api/admin/invite-codes', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminCreateInviteCode(token, payload) {
  return request('/api/admin/invite-codes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function adminRevokeInviteCode(token, id) {
  return request(`/api/admin/invite-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getUserStats(token) {
  return request('/api/user/stats', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function setUsername(token, username) {
  return request('/api/auth/username', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ username })
  });
}

export async function saveVaultToServer(token, slot = 'primary', payload) {
  return request(`/api/vault/${encodeURIComponent(slot)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export async function acceptTerms(token) {
  return request('/api/auth/accept-tos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function deleteAccount(token) {
  return request('/api/auth/account', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export async function updateProfile(token, payload) {
  return request('/api/auth/profile', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function getAuditLogs(token, limit = 50) {
  return request(`/api/audit-logs?limit=${limit}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function get2faStatus(token) {
  return request('/api/2fa/status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function setup2fa(token, payload) {
  return request('/api/2fa/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function saveRecoveryCodes(token, codesHash) {
  return request('/api/recovery/save', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ codesHash })
  });
}

export async function getRecoveryStatus(token) {
  return request('/api/recovery/status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}
