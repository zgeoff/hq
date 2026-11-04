import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../test/helpers.ts';
import { overrideEnv } from './config/override-env.ts';
import { logEvent } from './log-event.ts';
import { readEvents } from './read-events.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it reads the events of one subject and the given actions, oldest first', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  logEvent(ctx.db, 'run', 'GEO-9911', 'teapot-filled', 'kettle-bot', null, null, { cups: 2 });
  logEvent(ctx.db, 'run', 'GEO-9912', 'teapot-filled', 'kettle-bot', null, null);
  logEvent(ctx.db, 'hq', 'GEO-9911', 'teapot-filled', 'kettle-bot', null, null);
  logEvent(ctx.db, 'run', 'GEO-9911', 'teapot-emptied', 'kettle-bot', null, null);
  logEvent(ctx.db, 'run', 'GEO-9911', 'teapot-washed', 'kettle-bot', null, null);

  expect(readEvents(ctx.db, 'run', 'GEO-9911', ['teapot-washed', 'teapot-filled'])).toStrictEqual([
    { seq: expect.any(Number), action: 'teapot-filled', actor: 'kettle-bot', at: '2026-10-22T12:00:00Z', data: '{"cups":2}' },
    { seq: expect.any(Number), action: 'teapot-washed', actor: 'kettle-bot', at: '2026-10-22T12:00:00Z', data: '{}' },
  ]);
});
