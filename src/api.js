const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
const apiBasePointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawApiBaseUrl);
const browserIsLocalhost = /^(localhost|127\.0\.0\.1)$/i.test(browserHost);
const API_BASE_URL = apiBasePointsToLocalhost && !browserIsLocalhost ? '' : rawApiBaseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

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
    headers: {
      Authorization: `Bearer ${token}`
    }
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
