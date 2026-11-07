import type { Database } from 'bun:sqlite';
import { createCapacitySample } from './create-capacity-sample.ts';

// Stores raw text in a sample's errors column: a value writeCapacitySample never writes, such as text
// that is not JSON or a JSON value that is not text.
export function seedCapacitySampleErrors(db: Database, at: string, errorsText: string): void {
  createCapacitySample(db, { at, nonnixAwakeMib: 0 });
  db.run('UPDATE capacity_samples SET errors = ? WHERE at = ?', [errorsText, at]);
}
