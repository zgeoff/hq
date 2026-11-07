import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { readCount } from '../db/read-count.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { outagesIn } from './outages-in.ts';
import type { Downtime } from './types.ts';

const GAP_MIN = 2;

export function downtime(db: Database, from: Date, to: Date): Downtime {
  const f = from.getTime();
  const e = to.getTime();
  const rows = outagesIn(db, from, to);
  let downMs = 0;
  let longestMs = 0;
  for (const o of rows) {
    const s = Math.max(Date.parse(o.started_at), f);
    const x = Math.min(o.ended_at ? Date.parse(o.ended_at) : e, e);
    // Blind time inside an outage is the PC's own, not Nix's: only covered time counts as down.
    downMs += x > s ? coveredMs(db, s, x) : 0;
    longestMs = Math.max(longestMs, Date.parse(o.detected_at) - Date.parse(o.started_at));
  }
  const covered = coveredMs(db, f, e);
  const total = readCount(db, kdb(db).selectFrom('probe_samples').select((eb) => eb.fn.countAll<number>().as('count')).where('at', '>=', iso(from)).where('at', '<=', iso(to)).compile());
  const blindMs = Math.max(0, e - f - covered);
  return { from: iso(from), to: iso(to), samples: total, downMinutes: round(downMs / 60_000), outages: rows.length, longestDetectMinutes: round(longestMs / 60_000), blindMinutes: round(blindMs / 60_000), downMs, longestDetectMs: longestMs, blindMs };
}

const SampleAtSchema = z.object({ at: z.string() });

function coveredMs(db: Database, f: number, e: number): number {
  const sample = runSyncQuery(db, sql`SELECT at FROM probe_samples WHERE at >= ${iso(new Date(f - GAP_MIN * 60_000))} AND at <= ${iso(new Date(e))} AND NOT (target_ok = 0 AND control_ok = 0) ORDER BY at`.compile(kdb(db)), SampleAtSchema);
  let covered = 0;
  let edge = f;
  for (const s of sample) {
    const a = Math.max(Date.parse(s.at), edge);
    const b = Math.min(Date.parse(s.at) + GAP_MIN * 60_000, e);
    if (b > a) {
      covered += b - a;
      edge = b;
    }
  }
  return covered;
}

const round = (n: number) => Math.round(n * 10) / 10;
