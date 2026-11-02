import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { test } from 'node:test';
import { fetchFeed } from '../src/server/fetch-feed.js';
import { tunnelTls } from '../src/server/proxy.js';

const input = { feedUrl: 'http://93.184.216.34/feed', etag: '"cached"', lastModified: null };

test('feed fetching retries only transient failures', async (t) => {
  let attempts = 0;
  let status = 200;
  let retryAfter: string | undefined;
  let reset = false;
  let persistent = false;
  let oversized = false;
  const server = createServer((req, res) => {
    attempts++;
    assert.equal(req.headers['if-none-match'], input.etag);
    if (reset && attempts === 1) {
      req.socket.destroy();
      return;
    }
    res.statusCode = persistent || attempts === 1 ? status : 200;
    if (retryAfter !== undefined) res.setHeader('Retry-After', retryAfter);
    if (oversized) res.setHeader('Content-Length', 11 * 1024 * 1024);
    res.end('<rss/>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previous = { HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: process.env.NO_PROXY };
  process.env.HTTP_PROXY = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NO_PROXY = '';
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.closeAllConnections();
    server.close();
  });

  await t.test('success does not retry', async () => {
    assert.equal((await fetchFeed(input)).kind, 'ok');
    assert.equal(attempts, 1);
  });
  await t.test('503 retries once', async () => {
    attempts = 0;
    status = 503;
    assert.equal((await fetchFeed(input)).kind, 'ok');
    assert.equal(attempts, 2);
  });
  await t.test('404 does not retry', async () => {
    attempts = 0;
    status = 404;
    await assert.rejects(fetchFeed(input), /HTTP 404/);
    assert.equal(attempts, 1);
  });
  await t.test('429 respects a short Retry-After', async () => {
    attempts = 0;
    status = 429;
    retryAfter = '0';
    assert.equal((await fetchFeed(input)).kind, 'ok');
    assert.equal(attempts, 2);
  });
  await t.test('long Retry-After is not retried early', async () => {
    attempts = 0;
    retryAfter = '120';
    await assert.rejects(fetchFeed(input), /HTTP 429/);
    assert.equal(attempts, 1);
  });
  await t.test('connection reset retries once', async () => {
    attempts = 0;
    reset = true;
    assert.equal((await fetchFeed(input)).kind, 'ok');
    assert.equal(attempts, 2);
  });
  await t.test('persistent 503 stops after two attempts', async () => {
    attempts = 0;
    reset = false;
    persistent = true;
    status = 503;
    retryAfter = '0';
    await assert.rejects(fetchFeed(input), /HTTP 503/);
    assert.equal(attempts, 2);
  });
  await t.test('oversized feeds are not retried', async () => {
    attempts = 0;
    status = 200;
    oversized = true;
    await assert.rejects(fetchFeed(input), /feed too large/);
    assert.equal(attempts, 1);
  });
});

test('proxy TLS handshake can be aborted after CONNECT', async (t) => {
  const sockets = new Set<Socket>();
  const server = createServer();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const controller = new AbortController();
  server.on('connect', (_req, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.once('data', () => controller.abort());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  await assert.rejects(
    tunnelTls(
      { host: '127.0.0.1', port: (server.address() as AddressInfo).port, auth: null },
      new URL('https://example.com/feed'),
      controller.signal,
    ),
    { name: 'AbortError' },
  );
});
