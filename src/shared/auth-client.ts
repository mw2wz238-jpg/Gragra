/**
 * Client authentication helper for Project Vanguard
 * Manages session token and credentials across iframe/cross-site environments.
 */

let memoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (!memoryToken && typeof window !== 'undefined') {
    try {
      memoryToken = sessionStorage.getItem('vg_session_token');
    } catch {}
  }
  return memoryToken;
}

export function setSessionToken(token: string | null): void {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem('vg_session_token', token);
      } else {
        sessionStorage.removeItem('vg_session_token');
      }
    } catch {}
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
