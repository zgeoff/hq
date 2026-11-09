import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedDownProbeSample } from './seed-down-probe-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, target_ok, control_ok, ms, detail, ready_ok FROM probe_samples').all() };
}

test('#seedDownProbeSample stores a sample whose target failed while the control answered', () => {
  const ctx = setupTest();

  seedDownProbeSample(ctx, { at: '2026-10-15T00:00:00Z', detail: 'target HTTP 503; control ok' });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-15T00:00:00Z', target_ok: 0, control_ok: 1, ms: null, detail: 'target HTTP 503; control ok', ready_ok: null }]);
});
