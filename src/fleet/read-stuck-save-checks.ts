import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { Check } from '../health/types.ts';
import { pickStuckSaveChecks } from './pick-stuck-save-checks.ts';
import type { UnreadAnswer } from './pick-stuck-save-checks.ts';
import { refreshSchema } from './refresh-schema.ts';

const UNREAD_DATA = z.object({ sessionId: z.string(), error: z.string() });

export function readStuckSaveChecks(db: Database, at: Date): Check[] {
  const refresh = metaJson(db, 'fleet_refresh', refreshSchema, {});
  const askedAts = Object.values(refresh).flatMap((entry) => (entry.phase === 'asked' && entry.askedAt !== undefined ? [entry.askedAt] : []));
  return pickStuckSaveChecks(refresh, askedAts.length > 0 ? readUnreadAnswers(db, askedAts.toSorted()[0] ?? '') : [], at);
}

// An event whose data does not hold a session and an error is left out.
function readUnreadAnswers(db: Database, since: string): UnreadAnswer[] {
  const rows = db.query("SELECT at, data FROM events WHERE subject = 'hq' AND subject_id = 'fleet' AND action = 'stale-answer-unread' AND at >= ? ORDER BY seq").all(since) as { at: string; data: string }[];
  return rows.flatMap((row) => {
    const parsed = UNREAD_DATA.safeParse(JSON.parse(row.data));
    return parsed.success ? [{ sessionId: parsed.data.sessionId, at: row.at, error: parsed.data.error }] : [];
  });
}
