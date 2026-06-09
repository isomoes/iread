// src/server/routes/helpers.ts
// Shared route utilities: uniform error responses, id/number parsing, and a
// mapping from ServiceError codes to HTTP statuses.

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '../../shared/types.js';
import { ServiceError, type ServiceErrorCode } from '../feed-service.js';

/** Emit the uniform error shape `{ error: { message, code? } }`. */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  code?: string,
) {
  const body: ApiError = { error: code ? { message, code } : { message } };
  return c.json(body, status);
}

const CODE_TO_STATUS: Record<ServiceErrorCode, ContentfulStatusCode> = {
  BAD_INPUT: 400,
  UNSAFE_URL: 400,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  UNPARSEABLE: 422,
};

/**
 * Map any thrown error to a response. ServiceError carries an explicit code;
 * anything else becomes a 500 with a generic message (details are logged).
 */
export function serviceErrorToResponse(c: Context, err: unknown) {
  if (err instanceof ServiceError) {
    return errorResponse(c, CODE_TO_STATUS[err.code], err.message, err.code);
  }
  console.error('[iread] unexpected error:', err);
  return errorResponse(c, 500, 'An unexpected error occurred.', 'INTERNAL');
}

/** Parse a positive integer id from a path param; null if invalid. */
export function parseId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Parse an optional integer query param; returns undefined when absent/blank. */
export function parseOptionalInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
