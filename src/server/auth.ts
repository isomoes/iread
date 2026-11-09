import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

export function tokenAuth(token: string | undefined) {
  const expected = token ? createHash('sha256').update(token).digest() : undefined;

  return createMiddleware(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (expected) {
      const authorization = c.req.header('Authorization') ?? '';
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      const supplied = createHash('sha256').update(match?.[1] ?? '').digest();
      if (!match || !timingSafeEqual(expected, supplied)) {
        c.header('WWW-Authenticate', 'Bearer realm="iread"');
        return c.json({ error: { message: 'Authentication required', code: 'UNAUTHORIZED' } }, 401);
      }
    }
    await next();
  });
}
