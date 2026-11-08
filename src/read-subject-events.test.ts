import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../test/helpers.ts';
import { overrideEnv } from './config/override-env.ts';
import { logEvent } from './log-event.ts';
import { readSubjectEvents } from './read-subject-events.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it reads every event of one subject, oldest first', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const added = logEvent(ctx.db, 'ask', 'teapot-pour', 'added', 'kettle-bot', null, 'queued', { cups: 2 });
  logEvent(ctx.db, 'ask', 'teapot-spill', 'added', 'kettle-bot', null, 'queued');
  logEvent(ctx.db, 'hq', 'teapot-pour', 'noted', 'kettle-bot', null, null);
  const opened = logEvent(ctx.db, 'ask', 'teapot-pour', 'opened', 'kettle-bot', 'queued', 'open');

  expect(readSubjectEvents(ctx.db, 'ask', 'teapot-pour')).toStrictEqual([
    { seq: added, action: 'added', actor: 'kettle-bot', at: '2026-10-22T12:00:00Z', data: '{"cups":2}' },
    { seq: opened, action: 'opened', actor: 'kettle-bot', at: '2026-10-22T12:00:00Z', data: '{}' },
  ]);
});

test('it reads no events for a subject with none', () => {
  const ctx = setupTest();

  expect(readSubjectEvents(ctx.db, 'ask', 'teapot-pour')).toStrictEqual([]);
});
