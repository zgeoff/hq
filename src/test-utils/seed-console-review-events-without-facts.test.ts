import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { seedConsoleReviewEventsWithoutFacts } from './seed-console-review-events-without-facts.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readEvents: () => fresh.db.query('SELECT subject, subject_id, action, actor, at, data FROM events').all() };
}

test('#seedConsoleReviewEventsWithoutFacts stores one console review event with no facts', () => {
  const ctx = setupTest();

  seedConsoleReviewEventsWithoutFacts(ctx, { subject_id: 'review-6', data: '{"review":"lgtm","note":null,"facts":{"title":"Review kettle#7"}}' });

  expect(ctx.readEvents()).toStrictEqual([{ subject: 'unblock', subject_id: 'review-6', action: 'console-review', actor: 'console', at: '2026-10-14T01:00:00Z', data: '{"review":"lgtm","note":null}' }]);
});

test('#seedConsoleReviewEventsWithoutFacts applies input overrides', () => {
  const ctx = setupTest();

  seedConsoleReviewEventsWithoutFacts(ctx, { actor: 'teapot-bot', data: '{"review":"changes","note":"Wider lid."}' });

  expect(ctx.readEvents()).toMatchObject([{ actor: 'teapot-bot', data: '{"review":"changes","note":"Wider lid."}' }]);
});
