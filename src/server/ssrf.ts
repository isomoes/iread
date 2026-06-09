// src/server/ssrf.ts
// URL guard against SSRF: scheme allowlist plus DNS-resolved IP-range blocking
// (loopback / link-local / private / CGNAT / unique-local / unspecified), applied
// before the initial fetch and re-validated on every redirect hop. (PLAN 5.1, 10)

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

const MAX_REDIRECTS = 5;

export class SsrfError extends Error {
  override name = 'SsrfError';
}

// ---------------------------------------------------------------------------
// IP range checks
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    acc = acc * 256 + n;
  }
  return acc >>> 0;
}

function inCidr4(ipInt: number, baseIp: string, prefix: number): boolean {
  const base = ipv4ToInt(baseIp);
  if (base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (base & mask);
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable -> treat as unsafe
  return (
    inCidr4(n, '127.0.0.0', 8) ||      // loopback
    inCidr4(n, '10.0.0.0', 8) ||       // private
    inCidr4(n, '172.16.0.0', 12) ||    // private
    inCidr4(n, '192.168.0.0', 16) ||   // private
    inCidr4(n, '169.254.0.0', 16) ||   // link-local
    inCidr4(n, '100.64.0.0', 10) ||    // CGNAT
    inCidr4(n, '0.0.0.0', 8)           // unspecified / "this" network
  );
}

function normalizeIPv6(ip: string): string {
  // Strip zone id (fe80::1%eth0) and lowercase for prefix comparison.
  const zone = ip.indexOf('%');
  return (zone === -1 ? ip : ip.slice(0, zone)).toLowerCase();
}

function isBlockedIPv6(rawIp: string): boolean {
  const ip = normalizeIPv6(rawIp);

  if (ip === '::1') return true;                 // loopback
  if (ip === '::' || ip === '::0') return true;  // unspecified

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible addresses: validate the
  // embedded IPv4 against the v4 rules.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped && mapped[1]) return isBlockedIPv4(mapped[1]);
  const compat = ip.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (compat && compat[1]) return isBlockedIPv4(compat[1]);

  // Prefix checks on the first hextet(s).
  // fe80::/10 link-local: first 10 bits are 1111 1110 10 -> fe80..febf.
  const firstHextet = parseInt(ip.split(':')[0] || '0', 16);
  if (Number.isFinite(firstHextet)) {
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true; // not a valid IP literal -> unsafe
}

// ---------------------------------------------------------------------------
// URL assertion
// ---------------------------------------------------------------------------

/** A validated address with its IP family (4 or 6), safe to connect to. */
export interface ValidatedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Throw SsrfError unless `url` is a safe http(s) target:
 *  - scheme must be http or https,
 *  - a literal-IP host must not fall in a blocked range,
 *  - a DNS hostname must resolve only to non-blocked addresses (all A/AAAA).
 *
 * Returns the validated addresses so the caller can pin the connection to exactly
 * what was checked, closing the resolve-then-fetch (DNS-rebinding / TOCTOU) gap where
 * fetch() would otherwise re-resolve the hostname independently (PLAN 5.1, 10).
 */
export async function assertSafeFeedUrl(url: string): Promise<ValidatedAddress[]> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError('Invalid URL.');
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new SsrfError(`Unsupported URL scheme: ${scheme || '(none)'}.`);
  }

  // Hostname may be bracketed for IPv6 literals ([::1]); URL strips the brackets
  // from parsed.hostname already.
  const host = parsed.hostname;
  if (!host) throw new SsrfError('URL has no host.');

  const literalFamily = isIP(host);
  if (literalFamily !== 0) {
    if (isBlockedIp(host)) {
      throw new SsrfError('URL resolves to a blocked (private/loopback) address.');
    }
    return [{ address: host, family: literalFamily === 6 ? 6 : 4 }];
  }

  // DNS hostname: resolve all addresses and reject if any is blocked.
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`Could not resolve host: ${host}.`);
  }
  if (addrs.length === 0) {
    throw new SsrfError(`Host did not resolve to any address: ${host}.`);
  }
  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      throw new SsrfError('URL resolves to a blocked (private/loopback) address.');
    }
  }
  return addrs.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
}

// ---------------------------------------------------------------------------
// Guarded fetch with manual redirect handling
// ---------------------------------------------------------------------------

/** A lookup callback that yields only the pre-validated addresses (DNS-rebinding pin). */
function pinnedLookup(validated: ValidatedAddress[]) {
  // Node's LookupFunction passes either a numeric family or a LookupOptions object
  // (whose `family` may be 4 | 6 | 'IPv4' | 'IPv6'). We accept the loose shape and
  // normalize, then return only addresses we already validated.
  return (
    _hostname: string,
    options: number | { all?: boolean; family?: number | string },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ): void => {
    const rawFamily = typeof options === 'object' ? options.family : options;
    const wantFamily =
      rawFamily === 4 || rawFamily === 'IPv4'
        ? 4
        : rawFamily === 6 || rawFamily === 'IPv6'
          ? 6
          : 0;
    const wantAll = typeof options === 'object' ? options.all === true : false;
    const pool = wantFamily ? validated.filter((a) => a.family === wantFamily) : validated;
    const chosen = pool.length > 0 ? pool : validated;
    if (wantAll) {
      callback(null, chosen.map((a) => ({ address: a.address, family: a.family })));
      return;
    }
    const first = chosen[0]!;
    callback(null, first.address, first.family);
  };
}

function headersToObject(init: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Issue one GET to `url` over node:http(s), pinning the socket to the pre-validated
 * IP(s) via a custom `lookup`, so the kernel never re-resolves the hostname to a
 * different (private/loopback) address between assertSafeFeedUrl and connect
 * (DNS-rebinding / TOCTOU, PLAN 5.1/10). TLS SNI + Host header stay the original
 * hostname (node:https uses the URL host for both); only the connect target is pinned.
 * Returns a WHATWG Response so the streaming caller is unchanged.
 */
function pinnedFetch(
  url: string,
  validated: ValidatedAddress[],
  init: RequestInit,
): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const signal = init.signal ?? undefined;

  return new Promise<Response>((resolve, reject) => {
    const req = requestFn(
      parsed,
      {
        method: (init.method ?? 'GET').toUpperCase(),
        headers: headersToObject(init.headers),
        lookup: pinnedLookup(validated),
        // servername defaults to the URL hostname for https, preserving SNI.
      },
      (msg: IncomingMessage) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(msg.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) for (const one of v) headers.append(k, one);
          else headers.set(k, v);
        }
        const status = msg.statusCode ?? 0;
        // 204/304 must not carry a body in a Response.
        const nullBody = status === 204 || status === 304;
        const body = nullBody
          ? null
          : (Readable.toWeb(msg) as unknown as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status,
            statusText: msg.statusMessage ?? '',
            headers,
          }),
        );
      },
    );

    if (signal) {
      if (signal.aborted) {
        req.destroy(new DOMException('Aborted', 'AbortError'));
      } else {
        signal.addEventListener('abort', () => req.destroy(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      }
    }
    req.on('error', reject);
    req.end();
  });
}

/**
 * fetch() that follows redirects manually (max 5 hops), re-running the SSRF
 * guard on every hop's destination before requesting it. A redirect-count cap
 * alone is not protection; per-hop destination validation is what matters.
 *
 * The caller's `redirect` option is ignored/overridden to 'manual'.
 */
export async function fetchWithGuardedRedirects(
  initialUrl: string,
  init: RequestInit,
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await assertSafeFeedUrl(currentUrl);

    // Pin the connection to exactly the addresses we validated, so the hostname cannot
    // be re-resolved to a different (private/loopback) IP between the check and the
    // connect (DNS-rebinding / TOCTOU). Re-validated + re-pinned per redirect hop.
    const res = await pinnedFetch(currentUrl, validated, init);

    // Not a redirect: return as-is (including 304 and error statuses; the caller
    // interprets them).
    if (res.status < 300 || res.status >= 400 || res.status === 304) {
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      // Redirect status with no Location: nothing to follow, hand back the response.
      return res;
    }

    // Resolve relative redirects against the current URL.
    let next: string;
    try {
      next = new URL(location, currentUrl).toString();
    } catch {
      throw new SsrfError('Redirect target is not a valid URL.');
    }

    // Drain the redirect response body so the connection can be reused/closed.
    await res.body?.cancel().catch(() => {});

    currentUrl = next;
  }

  throw new SsrfError(`Too many redirects (> ${MAX_REDIRECTS}).`);
}
