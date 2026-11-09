import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedPRStatus } from './seed-pr-status.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readStatuses: () => fresh.db.query('SELECT repo, pr, head, gate, gate_head, gate_at, answer, next, updated_at FROM pr_status ORDER BY repo, pr').all() };
}

test('#seedPRStatus stores a record of a PR at its head, and input overrides apply', () => {
  const ctx = setupTest();

  seedPRStatus(ctx, { pr: 8, gate: 'pass', gate_head: '0123456789abcdef0123456789abcdef01234567', gate_at: '2026-10-14T00:30:00Z' });

  expect(ctx.readStatuses()).toStrictEqual([
    { repo: 'widgets', pr: 8, head: '0123456789abcdef0123456789abcdef01234567', gate: 'pass', gate_head: '0123456789abcdef0123456789abcdef01234567', gate_at: '2026-10-14T00:30:00Z', answer: null, next: null, updated_at: NOON_SYDNEY },
  ]);
});

test('#seedPRStatus keeps the fields a PR already holds that the input leaves out', () => {
  const ctx = setupTest();
  seedPRStatus(ctx, { gate: 'fail' });

  seedPRStatus(ctx, { head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321' });

  expect(ctx.readStatuses()).toMatchObject([{ head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321', gate: 'fail' }]);
});
