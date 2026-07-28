/**
 * Auth helper — returns headers with JWT token for API requests.
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('max_auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('max_user') || 'null');
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return !!localStorage.getItem('max_auth_token');
}
