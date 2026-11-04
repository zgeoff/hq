import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { LANES_HELD_SPANS } from './lanes-held-spans.ts';
import type { HeldSpan } from './types.ts';

const HELD_SPANS_SCHEMA = z.array(z.object({ from: z.string(), until: z.string() }));

export function readHeldSpans(db: Database): HeldSpan[] {
  return metaJson(db, LANES_HELD_SPANS, HELD_SPANS_SCHEMA, []);
}
