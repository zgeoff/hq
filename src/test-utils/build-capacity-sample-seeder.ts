import type { Database } from 'bun:sqlite';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';

export function buildCapacitySampleSeeder(db: Database) {
  return {
    sampleWithEmptyErrors: (at: string) => seedSampleWithEmptyErrors(db, at),
    sampleWithErrorsNotJSON: (at: string) => seedSampleWithErrorsNotJSON(db, at),
    sampleWithNonTextError: (at: string) => seedSampleWithNonTextError(db, at),
  };
}

function seedSampleWithEmptyErrors(db: Database, at: string): void {
  // A sample whose errors column holds empty text: hq stores errors as a JSON object.
  createCapacitySample(db, { at, nonnixAwakeMib: 0 });
  db.run("UPDATE capacity_samples SET errors = '' WHERE at = ?", [at]);
}

function seedSampleWithErrorsNotJSON(db: Database, at: string): void {
  // A sample whose errors column holds text that is not JSON: hq stores errors as a JSON object.
  createCapacitySample(db, { at, nonnixAwakeMib: 0 });
  db.run("UPDATE capacity_samples SET errors = '{oops' WHERE at = ?", [at]);
}

function seedSampleWithNonTextError(db: Database, at: string): void {
  // A sample whose errors object holds a number: hq stores each error as text.
  createCapacitySample(db, { at, nonnixAwakeMib: 0 });
  db.run(`UPDATE capacity_samples SET errors = '{"cloud":4}' WHERE at = ?`, [at]);
}
