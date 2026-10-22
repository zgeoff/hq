import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import { getMeta } from '../db/get-meta.ts';
import { openDb } from '../db/open-db.ts';
import { owner } from '../owner.ts';
import { addAsk } from './add-ask.ts';
import { laterAsk } from './later-ask.ts';
import { openAsk } from './open-ask.ts';
import { runCallReadyMorningTick } from './run-call-ready-morning-tick.ts';

// Sydney is on AEDT (UTC+11) in October, so 07:00 on 21 Oct is 20:00Z on 20 Oct.
function setupTest() {
  const area = mkdtempSync(join(tmpdir(), 'hq-call-ready-')),
    db = openDb(join(area, 'hq.db'));
  onTestFinished(() => {
    db.close();
    rmSync(area, { recursive: true, force: true });
  });
  return {
    db,
    addCall: (id: string, kind: 'call' | 'proposal' = 'call') => addAsk(db, { kind, id, title: 'Paint the shed', question: 'Green or grey?', body: 'Green or grey? Recommendation: green.', issues: ['GEO-1'], forSession: 'z-delivery', actor: 'z-refine' }),
    readOutbox: () => db.query('SELECT target, text, topic FROM outbox WHERE topic = ? ORDER BY id').all('call-ready-morning'),
  };
}

test('it queues call ready to the owner on the first tick after 07:00 when a call waits and nothing is open', () => {
  const ctx = setupTest();
  ctx.addCall('geo-1-paint');

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toStrictEqual([{ target: owner(), text: 'call ready', topic: 'call-ready-morning' }]);
  expect(getMeta(ctx.db, 'call_ready_morning_date')).toBe('2026-10-21');
});

test('it queues nothing before 07:00 Sydney time', () => {
  const ctx = setupTest();
  ctx.addCall('geo-1-paint');

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T19:59:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
  expect(getMeta(ctx.db, 'call_ready_morning_date')).toBeNull();
});

test('it queues call ready once for a Sydney date', () => {
  const ctx = setupTest();
  ctx.addCall('geo-1-paint');
  runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'));

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toHaveLength(1);
});

test('it counts a put-off call as waiting when it is due by the tick time though not by the clock', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-20T19:00:00Z'));
  ctx.addCall('geo-1-paint');
  laterAsk(ctx.db, 'geo-1-paint', 'call', '2026-10-20T20:30:00Z', 'z-stu');

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T21:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toStrictEqual([{ target: owner(), text: 'call ready', topic: 'call-ready-morning' }]);
});

test('it queues nothing while something is open', () => {
  const ctx = setupTest();
  ctx.addCall('geo-1-paint');
  ctx.addCall('geo-2-roof');
  openAsk(ctx.db, { force: true, actor: 'z-stu' });

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues nothing later that day when no call waited at the first tick', () => {
  const ctx = setupTest();
  runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'));
  ctx.addCall('geo-1-paint');

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues nothing when only a proposal waits', () => {
  const ctx = setupTest();
  ctx.addCall('tidy-docs', 'proposal');

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues call ready again on the next Sydney date', () => {
  const ctx = setupTest();
  ctx.addCall('geo-1-paint');
  runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'));

  expect(runCallReadyMorningTick(ctx.db, 'hq-lanes', new Date('2026-10-21T20:00:00Z'))).toBe(true);
  expect(getMeta(ctx.db, 'call_ready_morning_date')).toBe('2026-10-22');
});
