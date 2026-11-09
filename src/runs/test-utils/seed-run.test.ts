import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRun } from './seed-run.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRuns: () => fresh.db.query('SELECT issue, title, place, state, created_at, updated_at FROM runs').all() };
}

test('#seedRun adds a working run stamped with the clock', () => {
  const ctx = setupTest();

  seedRun(ctx);

  expect(ctx.readRuns()).toStrictEqual([{ issue: 'GEO-9001', title: 'Invented kettle work', place: 'imp', state: 'working', created_at: '2026-10-14T01:00:00Z', updated_at: '2026-10-14T01:00:00Z' }]);
});

test('#seedRun applies input overrides', () => {
  const ctx = setupTest();

  seedRun(ctx, { issue: 'GEO-9002', title: 'Descale the kettle', place: 'local' });

  expect(ctx.readRuns()).toMatchObject([{ issue: 'GEO-9002', title: 'Descale the kettle', place: 'local' }]);
});
