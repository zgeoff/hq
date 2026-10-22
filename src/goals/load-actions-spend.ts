import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { getMeta } from '../db/get-meta.ts';
import { ACTIONS_SPEND_KEY } from './actions-spend-key.ts';
import { actionsSpendReadingSchema } from './actions-spend-reading-schema.ts';
import type { ActionsSpendReading } from './actions-spend-reading-schema.ts';

const MAX_AGE_MS = 2 * 3_600_000;

// The month's Actions spend in US dollars from the last reading, or null when it is unknown: no
// reading, a failed one, one from another UTC month, one over MAX_AGE_MS old, or one that fails
// the schema. Null is never shown as $0.
export function loadActionsSpend(db: Database, at: Date): number | null {
  const reading = parseReading(getMeta(db, ACTIONS_SPEND_KEY));
  if (!reading || reading.month !== iso(at).slice(0, 7) || at.getTime() - Date.parse(reading.at) > MAX_AGE_MS) {
    return null;
  }
  return reading.net;
}

function parseReading(raw: string | null): ActionsSpendReading | null {
  try {
    const parsed = actionsSpendReadingSchema.safeParse(JSON.parse(raw ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
