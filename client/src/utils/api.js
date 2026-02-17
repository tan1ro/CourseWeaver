/**
 * Build headers for API requests, optionally including Clerk auth token.
 * @param {string} [token] - Clerk session token from useAuth().getToken()
 * @param {object} [extra] - Additional headers
 * @returns {object} Headers object
 */
export function authHeaders(token, extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
