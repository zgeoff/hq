import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedCapacitySampleErrors } from './seed-capacity-sample-errors.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readErrors: () => fresh.db.query('SELECT at, errors FROM capacity_samples').all() };
}

test.each([
  { state: 'empty' as const, text: '' },
  { state: 'text that is not JSON' as const, text: '{oops' },
  { state: 'an error that is not text' as const, text: '{"cloud":4}' },
])('it stores the $state errors column on one sample', (row) => {
  const ctx = setupTest();

  seedCapacitySampleErrors(ctx.db, '2026-10-14T00:00:00Z', row.state);

  expect(ctx.readErrors()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', errors: row.text }]);
});
