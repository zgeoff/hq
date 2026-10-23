import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { Check } from '../health/types.ts';
import { pickStuckSaveChecks } from './pick-stuck-save-checks.ts';
import type { UnreadAnswer } from './pick-stuck-save-checks.ts';
import { refreshSchema } from './refresh-schema.ts';

export function readStuckSaveChecks(db: Database, at: Date): Check[] {
  const refresh = metaJson(db, 'fleet_refresh', refreshSchema, {});
  const askedAts = Object.values(refresh).flatMap((entry) => (entry.phase === 'asked' && entry.askedAt !== undefined ? [entry.askedAt] : []));
  const earliest = askedAts.toSorted()[0];
  const unread = earliest === undefined ? [] : readUnreadAnswers(db, earliest);
  return pickStuckSaveChecks(refresh, unread, at);
}

const UNREAD_ROWS = z.array(z.object({ at: z.string(), data: z.string() }));
const UNREAD_DATA = z.object({ sessionId: z.string(), error: z.string() });

// An event whose data does not hold a session and an error is left out.
function readUnreadAnswers(db: Database, since: string): UnreadAnswer[] {
  const rows = UNREAD_ROWS.parse(db.query("SELECT at, data FROM events WHERE subject = 'hq' AND subject_id = 'fleet' AND action = 'stale-answer-unread' AND at >= ? ORDER BY seq").all(since));
  return rows.flatMap((row) => {
    const parsed = UNREAD_DATA.safeParse(JSON.parse(row.data));
    return parsed.success ? [{ sessionId: parsed.data.sessionId, at: row.at, error: parsed.data.error }] : [];
  });
}
