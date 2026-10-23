import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { AWAKE } from './awake.ts';
import { buildAwakeSchema } from './build-awake-schema.ts';

export type AwakeReading = NonNullable<z.output<ReturnType<typeof buildAwakeSchema>>>;

// The sweep's record of the sessions atc shows awake, or null when none is under 15 min old, as a
// wrong "free" could overfill the imp.
export function readFreshAwake(db: Database, at: Date): AwakeReading | null {
  const AWAKE_FRESH_MIN = 15;
  const reading = metaJson(db, AWAKE, buildAwakeSchema(), null);
  const sinceMs = reading === null ? Number.NaN : at.getTime() - Date.parse(reading.at);
  return sinceMs >= 0 && sinceMs <= AWAKE_FRESH_MIN * 60_000 ? reading : null;
}
