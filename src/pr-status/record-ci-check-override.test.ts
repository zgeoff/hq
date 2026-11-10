import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { REVIEWER } from '../runs/reviewer.ts';
import { findPRStatus } from './find-pr-status.ts';
import { recordCICheckOverride } from './record-ci-check-override.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    readQueued: () => readOutboxRows(fresh.db).map((row) => ({ target: row.target, text: row.text })),
    readStatus: (repo: string, pr: number) => findPRStatus(fresh.db, repo, pr),
  };
}

test('it queues one message to the reviewer naming the check, and sets next', async () => {
  const ctx = setupTest();

  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-1', note: 'known flake', actor: 'z-kettle', check: 'lint' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's override of the lint check on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes." }]);
  const status = await ctx.readStatus('widgets', 7);
  expect(status?.next).toBe(REVIEWER);
});
