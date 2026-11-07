import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { buildCapacitySampleSeeder } from './build-capacity-sample-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { seed: buildCapacitySampleSeeder(fresh.db), readErrors: () => fresh.db.query('SELECT at, errors FROM capacity_samples').all() };
}

test('#sampleWithEmptyErrors stores a sample with an empty errors column', () => {
  const ctx = setupTest();

  ctx.seed.sampleWithEmptyErrors('2026-10-14T00:00:00Z');

  expect(ctx.readErrors()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', errors: '' }]);
});

test('#sampleWithErrorsNotJSON stores a sample whose errors column is not JSON', () => {
  const ctx = setupTest();

  ctx.seed.sampleWithErrorsNotJSON('2026-10-14T00:00:00Z');

  expect(ctx.readErrors()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', errors: '{oops' }]);
});

test('#sampleWithNonTextError stores a sample whose error is a number', () => {
  const ctx = setupTest();

  ctx.seed.sampleWithNonTextError('2026-10-14T00:00:00Z');

  expect(ctx.readErrors()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', errors: '{"cloud":4}' }]);
});
