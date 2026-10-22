import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { LANES } from './lanes.ts';

// The Ready count a session reported, while fresh (30 min). It only informs the
// message: a self-reported 0 once stopped every nudge while work was waiting.
export function eligibleNow(db: Database): { count: number | null; at: string | null } {
  const r = metaJson(db, 'lanes_ready', z.object({ count: z.number(), at: z.string() }).nullable(), null);
  if (!r) return { count: null, at: null };
  const fresh = now().getTime() - new Date(r.at).getTime() <= LANES.readyFreshMinutes() * 60_000;
  return fresh ? r : { count: null, at: r.at };
}
