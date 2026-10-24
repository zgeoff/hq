import type { Database } from 'bun:sqlite';
import { getMeta } from '../../db/get-meta.ts';
import { LANES_CAP } from './lanes-cap.ts';
import type { LanesCap } from './lanes-cap.ts';
import { LANES_CAP_KEY } from './lanes-cap-key.ts';

export type StoredCap = { kind: 'none' } | { kind: 'set'; cap: LanesCap } | { kind: 'bad'; error: string };

// The stored cap. A value that is not JSON or does not fit the schema reads as bad, which the lanes
// treat as no cap and hq lanes cap reports.
export function readLanesCap(db: Database): StoredCap {
  const raw = getMeta(db, LANES_CAP_KEY);
  if (raw === null) {
    return { kind: 'none' };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: 'bad', error: `meta '${LANES_CAP_KEY}' is not valid JSON` };
  }
  const parsed = LANES_CAP.safeParse(value);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return { kind: 'bad', error: `meta '${LANES_CAP_KEY}' is malformed at ${issue?.path.join('.') || 'the top'}: ${issue?.message ?? 'invalid'}` };
  }
  return { kind: 'set', cap: parsed.data };
}
