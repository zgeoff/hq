import { expect, onTestFinished, test } from 'bun:test';
import { at, fakeAtc, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { holdLanes } from '../lanes/hold-lanes.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from './enqueue.ts';
import { flush } from './flush.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_NOTIFY', undefined));
  const atc = fakeAtc(fresh.dir);
  onTestFinished(() => atc.stop());
  return { db: fresh.db, atc };
}

test.each(['lanes-low-water', 'lanes-stalled-triage'])('it keeps a %s message queued before a lanes hold pending through the hold and sends it after', async (topic) => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  enqueue(ctx.db, logEvent(ctx.db, 'hq', 'kettle-alert', 'alerted', 'hq-lanes', null, null, {}), 'z-stu', 'Lanes: the kettle ran dry.', topic);
  holdLanes(ctx.db, 10, 'host switch', 'kettle-owner');

  await expect(flush(ctx.db)).resolves.toMatchObject({ sent: 0, failed: 0 });
  const during = ctx.atc.sent.map((message) => message.text);
  at('2026-10-14T01:11:00Z');
  await expect(flush(ctx.db)).resolves.toMatchObject({ sent: 1 });

  expect(during).toStrictEqual([]);
  expect(ctx.atc.sent.map((message) => message.text)).toStrictEqual(['Lanes: the kettle ran dry.']);
});
