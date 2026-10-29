import { describe, expect, it } from 'vitest';
import { failure, rateLimitMessage } from '../lib/api';

describe('rate limit messages', () => {
  it('rateLimitMessage in seconds', () => {
    expect(rateLimitMessage(30)).toBe('Too many requests. Try again in 30 seconds.');
  });

  it('rateLimitMessage in minutes', () => {
    expect(rateLimitMessage(61)).toBe('Too many requests. Try again in 2 minutes.');
    expect(rateLimitMessage(60)).toBe('Too many requests. Try again in 1 minute.');
  });

  it('failure uses Retry-After', async () => {
    const err = await failure(new Response('{"error":"x"}', { status: 429, headers: { 'Retry-After': '30' } }));
    expect(err.status).toBe(429);
    expect(err.message).toBe('Too many requests. Try again in 30 seconds.');
  });
});
