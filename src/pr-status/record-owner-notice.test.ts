import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { REVIEWER } from '../runs/reviewer.ts';
import { recordCICheckOverride } from './record-ci-check-override.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { recordPROverride } from './record-pr-override.ts';

const head = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    readQueued: () => readOutboxRows(fresh.db).map((row) => ({ target: row.target, text: row.text })),
    readNext: () => fresh.db.query('SELECT next FROM pr_status').all(),
  };
}

test('#recordPRAnswer queues one message to the reviewer and sets next on lgtm', () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's lgtm on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes." }]);
  expect(ctx.readNext()).toStrictEqual([{ next: REVIEWER }]);
});

test.each(['changes', 'reject'] as const)('#recordPRAnswer queues nothing and leaves next for %s', (answer) => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer, head, source: 'chat:kettle-1', note: 'rename it', actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([]);
  expect(ctx.readNext()).toStrictEqual([{ next: null }]);
});

test('#recordPRAnswer queues nothing when the reviewer records the lgtm', () => {
  const ctx = setupTest();

  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head, source: 'chat:kettle-1', note: null, actor: REVIEWER });

  expect(ctx.readQueued()).toStrictEqual([]);
});

test('#recordPROverride queues one message to the reviewer naming the override', () => {
  const ctx = setupTest();

  recordPROverride(ctx.db, { repo: 'widgets', pr: 7, head, source: 'chat:kettle-1', note: 'known flake', actor: 'z-kettle' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's override of the open findings on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes." }]);
  expect(ctx.readNext()).toStrictEqual([{ next: REVIEWER }]);
});

test('#recordCICheckOverride queues one message to the reviewer naming the check', () => {
  const ctx = setupTest();

  recordCICheckOverride(ctx.db, { repo: 'widgets', pr: 7, head, source: 'chat:kettle-1', note: 'known flake', actor: 'z-kettle', check: 'lint' });

  expect(ctx.readQueued()).toStrictEqual([{ target: REVIEWER, text: "The owner's override of the lint check on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes." }]);
});
