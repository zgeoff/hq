import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { LANES_HELD_SPANS } from './lanes-held-spans.ts';
import type { HeldSpan } from './types.ts';

export function writeHeldSpans(db: Database, spans: readonly HeldSpan[]): void {
  const value = spans.length === 0 ? null : JSON.stringify(spans);
  setMeta(db, LANES_HELD_SPANS, value);
}
