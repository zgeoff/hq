import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { LANES_HELD_SPAN } from './lanes-held-span.ts';

export interface HeldSpan {
  from: string;
  until: string;
}

export function readHeldSpan(db: Database): HeldSpan | null {
  return metaJson(db, LANES_HELD_SPAN, z.object({ from: z.string(), until: z.string() }).nullable(), null);
}
