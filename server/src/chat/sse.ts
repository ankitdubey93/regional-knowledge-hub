import type { Response } from 'express';

export type SseEventName = 'start' | 'sources' | 'delta' | 'done' | 'error';

/** One event: `event: <name>\ndata: <JSON>\n\n`. JSON.stringify never emits a raw newline. */
export function formatSse(event: SseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 200 with Content-Type text/event-stream; charset=utf-8, Cache-Control no-cache, no-transform, Connection keep-alive, X-Accel-Buffering no; then res.flushHeaders(). */
export function openSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Writes one event unless the response has ended. */
export function sendSse(res: Response, event: SseEventName, data: unknown): void {
  if (res.writableEnded) return;
  res.write(formatSse(event, data));
}
