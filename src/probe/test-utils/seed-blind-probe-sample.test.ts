import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedBlindProbeSample } from './seed-blind-probe-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, target_ok, control_ok, ms, detail, ready_ok FROM probe_samples').all() };
}

test('#seedBlindProbeSample stores a sample whose target and control both failed', () => {
  const ctx = setupTest();

  seedBlindProbeSample(ctx, { at: '2026-10-15T00:00:00Z' });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-15T00:00:00Z', target_ok: 0, control_ok: 0, ms: null, detail: null, ready_ok: null }]);
});
