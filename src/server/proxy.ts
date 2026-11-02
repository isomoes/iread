// src/server/proxy.ts
// Optional outbound HTTP(S) proxy support for feed fetching, driven by the usual
// HTTPS_PROXY / HTTP_PROXY / NO_PROXY environment variables (either case).
// Only `http://` proxy URLs are supported (HTTPS targets are tunnelled via CONNECT).

import { request as httpRequest } from 'node:http';
import type { Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

export interface ProxyConfig {
  host: string;
  port: number;
  auth: string | null; // "user:pass" or null
}

function env(name: string): string | undefined {
  return process.env[name] ?? process.env[name.toLowerCase()] ?? undefined;
}

function bypassed(host: string, port: string, noProxy: string): boolean {
  const h = host.toLowerCase();
  for (const raw of noProxy.split(',')) {
    let entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry === '*') return true;
    const colon = entry.lastIndexOf(':');
    if (colon > 0 && !entry.endsWith(']') && /^\d+$/.test(entry.slice(colon + 1))) {
      if (entry.slice(colon + 1) !== port) continue;
      entry = entry.slice(0, colon);
    }
    entry = entry.replace(/^\*?\./, '');
    if (h === entry || h.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/** Proxy to use for `target`, or null for a direct connection. */
export function proxyFor(target: URL): ProxyConfig | null {
  const isHttps = target.protocol === 'https:';
  const value = isHttps ? (env('HTTPS_PROXY') ?? env('HTTP_PROXY')) : env('HTTP_PROXY');
  if (!value) return null;
  const port = target.port || (isHttps ? '443' : '80');
  const host = target.hostname.replace(/^\[|\]$/g, '');
  if (bypassed(host, port, env('NO_PROXY') ?? '')) return null;

  let p: URL;
  try {
    p = new URL(value.includes('://') ? value : `http://${value}`);
  } catch {
    return null;
  }
  if (p.protocol !== 'http:') return null;
  const auth = p.username
    ? `${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`
    : null;
  return { host: p.hostname.replace(/^\[|\]$/g, ''), port: Number(p.port || 80), auth };
}

function proxyAuthHeader(proxy: ProxyConfig): Record<string, string> {
  return proxy.auth
    ? { 'Proxy-Authorization': `Basic ${Buffer.from(proxy.auth).toString('base64')}` }
    : {};
}

/** Headers to add when sending an absolute-URI request to the proxy (http targets). */
export function plainProxyHeaders(proxy: ProxyConfig): Record<string, string> {
  return proxyAuthHeader(proxy);
}

/**
 * Open a CONNECT tunnel through `proxy` to target host:port and wrap it in TLS
 * (SNI = target hostname). Honors `signal` for cancellation.
 */
export function tunnelTls(
  proxy: ProxyConfig,
  target: URL,
  signal: AbortSignal | undefined,
): Promise<Socket> {
  const port = target.port || '443';
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const authority = `${target.hostname}:${port}`;
  return new Promise<Socket>((resolve, reject) => {
    const req = httpRequest({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: { Host: authority, ...proxyAuthHeader(proxy) },
    });
    let tunnel: Socket | undefined;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = (err: Error) => {
      cleanup();
      reject(err);
    };
    const abort = () => {
      const err = new DOMException('Aborted', 'AbortError');
      tunnel?.destroy(err);
      req.destroy(err);
      fail(err);
    };
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    req.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        fail(new Error(`proxy CONNECT failed: HTTP ${res.statusCode ?? 0}`));
        return;
      }
      const tls = tlsConnect({ socket, servername: hostname });
      tunnel = tls;
      tls.once('secureConnect', () => {
        cleanup();
        resolve(tls);
      });
      tls.once('error', fail);
    });
    req.once('error', fail);
    req.end();
  });
}
