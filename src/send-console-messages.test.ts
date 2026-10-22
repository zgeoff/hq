import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { NOON_SYDNEY, at, fakeAtc, freshDb } from '../test/helpers.ts';
import { logEvent } from './log-event.ts';
import { overrideEnv } from './config/override-env.ts';
import { enqueue } from './outbox/enqueue.ts';
import { roleName } from './roles/role-name.ts';
import { sendConsoleMessages } from './send-console-messages.ts';

function setupTest() {
  const fresh = freshDb(),
    lines: string[] = [],
    spy = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_NOTIFY', undefined));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', `${fresh.dir}/nobody-home.sock`));
  enqueue(fresh.db, logEvent(fresh.db, 'ask', 'kettle-mint', 'console-answer', 'console', null, null), roleName('owner'), 'console answer: call kettle-mint: Yes, mint them');
  return {
    db: fresh.db,
    lines,
    startAtc: () => {
      const atc = fakeAtc(fresh.dir);
      onTestFinished(() => atc.stop());
      return atc;
    },
    readStatus: () => fresh.db.query('SELECT status FROM outbox').values().flat() };
}

test('a failed send says so, is logged, and stays in the outbox for a retry', async () => {
  const app = setupTest(),
    told = await sendConsoleMessages(app.db);

  expect(told).toBe(false);
  expect(app.readStatus()).toStrictEqual(['failed']);
  expect(app.lines.join('\n')).toContain('console: the message to the owner session failed');
});

test('a message the owner session gets says so', async () => {
  const app = setupTest(),
    atc = app.startAtc(),
    told = await sendConsoleMessages(app.db);

  expect(told).toBe(true);
  expect(atc.sent.map((m) => m.text)).toStrictEqual(['console answer: call kettle-mint: Yes, mint them']);
});
