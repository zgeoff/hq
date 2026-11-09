import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedRoundRowOutsideChecks } from './seed-round-row-outside-checks.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRounds: () => fresh.db.query('SELECT repo, pr, kind, ok, full FROM noslop_rounds ORDER BY id').all() };
}

test('#seedRoundRowOutsideChecks stores a round row when the values pass the checks, and input overrides apply', () => {
  const ctx = setupTest();

  seedRoundRowOutsideChecks(ctx, { kind: 'check', full: 1 });

  expect(ctx.readRounds()).toStrictEqual([{ repo: 'widgets', pr: 7, kind: 'check', ok: 1, full: 1 }]);
});

test.each([
  ['a kind the table does not know', { kind: 'other' }],
  ['an ok flag beyond 0 and 1', { ok: 2 }],
  ['a full flag beyond 0 and 1', { full: 2 }],
])('#seedRoundRowOutsideChecks fails on %s', (_label, input) => {
  const ctx = setupTest();

  expect(() => seedRoundRowOutsideChecks(ctx, input)).toThrow('CHECK constraint failed');
});
