import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Hono } from 'hono';
import { tokenAuth } from '../src/server/auth.js';

function createApp(token?: string) {
  const app = new Hono();
  app.use('/api/*', tokenAuth(token));
  app.all('/api/*', (c) => c.json({ ok: true }));
  app.get('/', (c) => c.text('public UI'));
  return app;
}

test('authentication is disabled for unset or empty tokens', async () => {
  for (const token of [undefined, '']) {
    const app = createApp(token);
    assert.equal((await app.request('/api/feeds')).status, 200);
    assert.equal((await app.request('/api/items', { method: 'PATCH' })).status, 200);
  }
});

test('configured token protects all API methods and leaves static UI public', async () => {
  const app = createApp('secret-token');
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    for (const authorization of ['', 'Bearer wrong', 'Basic secret-token', 'Bearer secret-token extra']) {
      const response = await app.request('/api/opml', { method, headers: { Authorization: authorization } });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer realm="iread"');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      if (method !== 'HEAD') {
        assert.deepEqual(await response.json(), {
          error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
        });
      }
    }
    assert.equal((await app.request('/api/opml', {
      method, headers: { Authorization: 'Bearer secret-token' },
    })).status, 200);
  }
  assert.equal((await app.request('/api/feeds?token=secret-token')).status, 401);
  assert.equal((await app.request('/api/unknown')).status, 401);
  assert.equal((await app.request('/api/items', {
    headers: { Authorization: 'bearer secret-token' },
  })).status, 200);
  assert.equal((await app.request('/')).status, 200);
});

test('server applies authentication before every API router and fallback', { timeout: 15000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'iread-auth-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      HOST: '127.0.0.1',
      DB_PATH: join(directory, 'iread.db'),
      OPML_PATH: '',
      AUTH_TOKEN: 'integration-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const port = await new Promise<string>((resolve, reject) => {
    let output = '';
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      const match = /listening on http:\/\/localhost:(\d+)/.exec(output);
      if (match?.[1]) resolve(match[1]);
    });
  });
  const base = `http://127.0.0.1:${port}`;
  for (const path of ['/api', '/api/auth', '/api/feeds', '/api/items', '/api/opml', '/api/unknown']) {
    assert.equal((await fetch(`${base}${path}`)).status, 401, path);
  }
  const headers = { Authorization: 'Bearer integration-secret' };
  assert.equal((await fetch(`${base}/api/auth`, { headers })).status, 204);
  assert.equal((await fetch(`${base}/api/feeds`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/items`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/opml`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/unknown`, { headers })).status, 404);
  assert.notEqual((await fetch(`${base}/`)).status, 401);
});
