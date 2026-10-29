import type { RequestHandler } from 'express';
import { env } from '../env';
import { adminOf, firmOf } from '../types';
import { consume, ipKey, LIMITS, type LimitName } from '../services/rateLimitService';

// Better Auth reads only x-forwarded-for for the client IP. Overwrite it with Express's own answer
// (which honours TRUST_PROXY_HOPS) so a client cannot spoof the IP Better Auth sees.
export const pinForwardedFor: RequestHandler = (req, res, next) => {
  req.headers['x-forwarded-for'] = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  // Better Auth's 429 sets only X-Retry-After; mirror it as the standard Retry-After header.
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name: string, value: number | string | readonly string[]) => {
    if (name.toLowerCase() === 'x-retry-after') setHeader('Retry-After', value);
    return setHeader(name, value);
  };
  next();
};

function tooMany(res: Parameters<RequestHandler>[1], retryAfter: number | null): void {
  const seconds = retryAfter ?? 1;
  res.set('Retry-After', String(seconds)).status(429).json({ error: 'Too many requests. Try again in a moment.', retryAfter: seconds });
}

// Place after requireFirm or requireAdmin: the user id comes only from the session.
export function limitByUser(name: LimitName): RequestHandler {
  return async (_req, res, next) => {
    if (env.RATE_LIMITS === 'off') {
      next();
      return;
    }
    const userId = res.locals.admin ? adminOf(res).userId : firmOf(res).userId;
    const r = await consume(`${name}:u:${userId}`, LIMITS[name]);
    if (!r.allowed) {
      tooMany(res, r.retryAfter);
      return;
    }
    next();
  };
}

export function limitByIp(name: LimitName): RequestHandler {
  return async (req, res, next) => {
    if (env.RATE_LIMITS === 'off') {
      next();
      return;
    }
    const r = await consume(`${name}:ip:${ipKey(req.ip ?? 'unknown')}`, LIMITS[name]);
    if (!r.allowed) {
      tooMany(res, r.retryAfter);
      return;
    }
    next();
  };
}
