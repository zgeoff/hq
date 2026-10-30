import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../test/helpers.ts';
import { listEvents } from './list-events.ts';
import { logEvent } from './log-event.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it lists only the events of the given action, oldest first', () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'hq', 'widgets#1', 'invented-action', 'hq', null, 'first', { reason: 'one' });
  logEvent(ctx.db, 'hq', 'widgets#2', 'other-action', 'hq', null, 'skipped');
  logEvent(ctx.db, 'hq', 'widgets#3', 'invented-action', 'hq', 'first', 'second');

  expect(listEvents(ctx.db, 'invented-action')).toStrictEqual([
    { subject: 'hq', subject_id: 'widgets#1', action: 'invented-action', from_state: null, to_state: 'first', actor: 'hq', data: '{"reason":"one"}' },
    { subject: 'hq', subject_id: 'widgets#3', action: 'invented-action', from_state: 'first', to_state: 'second', actor: 'hq', data: '{}' },
  ]);
});
