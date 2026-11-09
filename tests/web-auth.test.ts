import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, ApiError } from '../src/web/lib/api.js';
import { AUTH_REQUIRED_EVENT, getAuthToken, setAuthToken } from '../src/web/lib/auth.js';

test('web client authenticates JSON requests and OPML downloads', async (t) => {
  const storage = new Map<string, string>();
  const window = new EventTarget();
  const originals = new Map(['sessionStorage', 'window'].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let status = 200;
  let authorization: string | null = null;
  let requestedUrl = '';
  let onFetch: (() => void) | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requestedUrl = url;
    authorization = new Headers(init.headers).get('Authorization');
    assert.equal(init.cache, 'no-store');
    onFetch?.();
    return new Response(status === 200 ? '<opml/>' : JSON.stringify({
      error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
    }), { status });
  });

  setAuthToken('browser-secret');
  assert.equal(await (await api.exportOpml()).text(), '<opml/>');
  assert.equal(requestedUrl, '/api/opml');
  assert.equal(authorization, 'Bearer browser-secret');

  setAuthToken('');
  await api.exportOpml();
  assert.equal(authorization, null);

  let requiredEvents = 0;
  window.addEventListener(AUTH_REQUIRED_EVENT, () => { requiredEvents++; });
  setAuthToken('old-token');
  status = 401;
  await assert.rejects(api.listFeeds(), (error: unknown) =>
    error instanceof ApiError && error.status === 401 && error.code === 'UNAUTHORIZED');
  assert.equal(authorization, 'Bearer old-token');
  assert.equal(getAuthToken(), '');
  assert.equal(requiredEvents, 1);

  setAuthToken('old-token');
  onFetch = () => setAuthToken('new-token');
  await assert.rejects(api.exportOpml(), ApiError);
  assert.equal(getAuthToken(), 'new-token');
  assert.equal(requiredEvents, 1);
});
