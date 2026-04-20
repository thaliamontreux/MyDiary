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

export async function registerUser(email, password) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
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

export async function saveVaultToServer(token, slot = 'primary', payload) {
  return request(`/api/vault/${encodeURIComponent(slot)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}
