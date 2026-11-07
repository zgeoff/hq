import type { Database } from 'bun:sqlite';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';

// hq stores a sample's errors as a JSON object of text; each state here is one that hq never writes.
const ERRORS_TEXT = {
  empty: '',
  'text that is not JSON': '{oops',
  'an error that is not text': '{"cloud":4}',
} as const;

export type SampleErrorsState = keyof typeof ERRORS_TEXT;

export function seedCapacitySampleErrors(db: Database, at: string, state: SampleErrorsState): void {
  createCapacitySample(db, { at, nonnixAwakeMib: 0 });
  db.run('UPDATE capacity_samples SET errors = ? WHERE at = ?', [ERRORS_TEXT[state], at]);
}
