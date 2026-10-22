import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import type { LanesHold } from './types.ts';

export function getLanesHold(db: Database): LanesHold | null {
  const h = metaJson(db, 'lanes_hold', z.object({ until: z.string(), reason: z.string(), by: z.string() }).nullable(), null);
  if (!h) return null;
  return new Date(h.until).getTime() > now().getTime() ? h : null;
}
