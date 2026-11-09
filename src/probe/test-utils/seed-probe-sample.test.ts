import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedProbeSample } from './seed-probe-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, target_ok, control_ok, ms AS duration_ms, detail, ready_ok FROM probe_samples').all() };
}

test('#seedProbeSample stores a sample whose target answered and the control was not asked, and input overrides apply', () => {
  const ctx = setupTest();

  seedProbeSample(ctx, { at: '2026-10-15T00:00:00Z', durationMs: 20, readyOk: false });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-15T00:00:00Z', target_ok: 1, control_ok: null, duration_ms: 20, detail: null, ready_ok: 0 }]);
});
