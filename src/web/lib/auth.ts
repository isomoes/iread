const TOKEN_KEY = 'iread.authToken';
export const AUTH_REQUIRED_EVENT = 'iread:auth-required';

export function getAuthToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

export function setAuthToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  if (response.status === 401 && token === getAuthToken()) {
    setAuthToken('');
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
  return response;
}
