import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { LANES_HELD_SPANS } from './lanes-held-spans.ts';
import { readOlderHoldSpan } from './read-older-hold-span.ts';
import type { HeldSpan } from './types.ts';

const HELD_SPANS_SCHEMA = z.array(z.object({ from: z.string(), until: z.string() }));

export function readHeldSpans(db: Database): HeldSpan[] {
  if (getMeta(db, LANES_HELD_SPANS) === null) {
    return readOlderHoldSpan(db);
  }
  return metaJson(db, LANES_HELD_SPANS, HELD_SPANS_SCHEMA, []);
}
