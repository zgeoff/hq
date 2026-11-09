import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { readOutboxRows } from '../outbox/read-outbox-rows.ts';
import { takeQueued } from '../outbox/take-queued.ts';
import { readEvents } from '../read-events.ts';
import { downtime } from './downtime.ts';
import { KEEP_DAYS } from './keep-days.ts';
import { openUnready } from './open-unready.ts';
import { probeHealth } from './probe-health.ts';
import { probeOnce } from './probe-once.ts';
import { readOutageRows } from './read-outage-rows.ts';
import { seedProbeSample } from './test-utils/seed-probe-sample.ts';
import type { Fetcher } from './types.ts';
import { unreadyIn } from './unready-in.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';

interface World {
  target: boolean;
  control: boolean;
  ready?: boolean;
}

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  updateEnv('HQ_PROBE_TARGET', 'https://target.invalid/live');
  updateEnv('HQ_PROBE_CONTROL', 'https://control.invalid/ok');
  updateEnv('HQ_PROBE_READY', 'https://target.invalid/ready');
  updateEnv('HQ_NOTIFY', 'off');
  const db: Database = fresh.db;
  const urls: string[] = [];
  const probeAt = (time: string, world: World) => {
    at(time);
    return probeOnce(
      db,
      (url) => {
        urls.push(url);
        return fake(world)(url);
      },
      'hq-probe',
    );
  };

  return { db, urls, probeAt, step: (offsetMinutes: number, world: World) => probeAt(minute(offsetMinutes), world) };
}

const T0 = Date.parse(NOON_SYDNEY);
const minute = (m: number) => iso(new Date(T0 + m * 60_000));

function fake(world: { target: boolean; control: boolean; ready?: boolean }): Fetcher {
  return async (url) => {
    const ok = url.endsWith('/ready') ? (world.ready ?? true) : url.includes('target') ? world.target : world.control;
    return { ok, status: ok ? 200 : 503, ms: 12, ...(ok ? {} : { error: 'HTTP 503' }) };
  };
}
const UP = { target: true, control: true };
const DOWN = { target: false, control: true };
const BLIND = { target: false, control: false };

test('samples are up, down or blind, and the control is fetched only when the target fails', async () => {
  const ctx = setupTest();
  const up = await ctx.step(0, UP);
  expect(up.state).toBe('up');
  expect(ctx.urls).toStrictEqual(['https://target.invalid/live', 'https://target.invalid/ready']);
  ctx.urls.length = 0;
  const down = await ctx.step(1, DOWN);
  expect(down.state).toBe('down');
  expect(ctx.urls).toStrictEqual(['https://target.invalid/live', 'https://control.invalid/ok']);
  const blind = await ctx.step(2, BLIND);
  expect(blind.state).toBe('blind');
  expect(ctx.db.query('SELECT at, target_ok, control_ok, ready_ok FROM probe_samples ORDER BY at').all()).toStrictEqual([
    { at: minute(0), target_ok: 1, control_ok: null, ready_ok: 1 },
    { at: minute(1), target_ok: 0, control_ok: 1, ready_ok: null },
    { at: minute(2), target_ok: 0, control_ok: 0, ready_ok: null },
  ]);
});

test('two downs open one outage dated from the first; a third queues nothing more', async () => {
  const ctx = setupTest();
  await ctx.step(0, UP);
  const firstDown = await ctx.step(1, DOWN);
  expect(firstDown.opened).toBeUndefined();
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  const result = await ctx.step(2, DOWN);
  expect(result.opened).toBe(1);
  const [alert] = readEvents(ctx.db, 'hq', 'probe', ['outage']);
  expect(readOutageRows(ctx.db)).toStrictEqual([{ id: 1, started_at: minute(1), detected_at: minute(2), ended_at: null, alert_seq: alert?.seq ?? null, recover_seq: null, kind: 'down' }]);

  expect(readOutboxRows(ctx.db).map((row) => row.target)).toStrictEqual(['z-stu', 'z-delivery']);
  expect(readOutboxRows(ctx.db)[0]).toMatchObject({ topic: 'nix-outage', status: 'pending' });
  expect(readOutboxRows(ctx.db)[1]?.text).toBe(readOutboxRows(ctx.db)[0]?.text);
  expect(readOutboxRows(ctx.db)[0]?.text).toContain('Nix is down: https://target.invalid/live failing since 12:01 (2 checks; control URL fine)');
  await ctx.step(3, DOWN);
  expect(readOutboxRows(ctx.db)).toHaveLength(2);
  expect(readOutageRows(ctx.db)).toHaveLength(1);
  expect(ctx.db.query("SELECT COUNT(*) AS count FROM events WHERE subject = 'hq' AND subject_id = 'probe' AND action = 'outage'").get()).toStrictEqual({ count: 1 });
});

test('a blind sample neither opens nor resets the run of downs', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  await ctx.step(1, BLIND);
  const result = await ctx.step(2, DOWN);
  expect(result.opened).toBe(1);
  expect(readOutageRows(ctx.db)[0]?.started_at).toBe(minute(0));
});

test('blind samples alone open nothing', async () => {
  const ctx = setupTest();
  for (let offset = 0; offset < 5; offset += 1) {
    await ctx.step(offset, BLIND);
  }
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
});

test('an up sample resets the run', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  await ctx.step(1, UP);
  await ctx.step(2, DOWN);
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
});

test('an up closes the outage and queues one recovery message', async () => {
  const ctx = setupTest();
  for (let minuteIndex = 0; minuteIndex <= 5; minuteIndex++) {
    await ctx.step(minuteIndex, DOWN);
  }
  const result = await ctx.step(6, UP);
  expect(result.closed).toBe(1);
  expect(readOutageRows(ctx.db)[0]?.ended_at).toBe(minute(6));
  expect(readOutboxRows(ctx.db).map((row) => [row.target, row.text])).toStrictEqual([
    ['z-stu', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
    ['z-delivery', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
  ]);
  await ctx.step(7, UP);
  expect(readOutboxRows(ctx.db)).toHaveLength(2);
});

test('a single down then up opens nothing', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  await ctx.step(1, UP);
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});

test('the probe sends nothing itself: the alert is queued for the command that ran it to send', async () => {
  const ctx = setupTest();
  takeQueued();
  await ctx.step(0, DOWN);
  await ctx.step(1, DOWN);
  expect(readOutboxRows(ctx.db).map((row) => row.status)).toStrictEqual(['pending', 'pending']);
  const ids = takeQueued();
  expect(ids).toHaveLength(2);
  expect(ctx.db.query(`SELECT DISTINCT topic FROM outbox WHERE id IN (${ids.join(',')})`).all()).toStrictEqual([{ topic: 'nix-outage' }]);
});

test('health: one failed check with the control fine is not reported as Nix up', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  const health = probeHealth(ctx.db, new Date(T0 + 1 * 60_000));
  expect(health).toMatchObject({ ok: true, line: expect.stringContaining('last check 1 min ago failed (control fine); an outage opens after 2 failed checks in a row') });
});

test('samples older than the keep window are pruned', async () => {
  const ctx = setupTest();
  await ctx.step(0, UP);
  await ctx.probeAt(iso(new Date(T0 + (KEEP_DAYS + 1) * 86_400_000)), UP);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM probe_samples').get()).toStrictEqual({ count: 1 });
});

test('downtime clips outages to the window, counts an open one to the end, and reports detection delay and blind time', async () => {
  const ctx = setupTest();
  for (let offset = 0; offset <= 4; offset += 1) {
    await ctx.step(offset, UP);
  }
  await ctx.step(5, DOWN);
  await ctx.step(6, DOWN);
  for (let offset = 7; offset <= 10; offset += 1) {
    await ctx.step(offset, DOWN);
  }
  await ctx.step(11, UP);
  for (let offset = 12; offset <= 14; offset += 1) {
    await ctx.step(offset, UP);
  }
  await ctx.step(15, DOWN);
  await ctx.step(16, DOWN);
  for (let offset = 17; offset <= 19; offset += 1) {
    await ctx.step(offset, DOWN);
  }
  const window = downtime(ctx.db, new Date(T0 + 8 * 60_000), new Date(T0 + 20 * 60_000));
  expect(window.outages).toBe(2);
  expect(window.downMinutes).toBe(3 + 5);
  expect(window.longestDetectMinutes).toBe(1);
  expect(window.samples).toBe(12);
  expect(window.blindMinutes).toBe(0);
});

test('blind minutes inside an outage are not counted as downtime', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  await ctx.step(1, DOWN);
  for (let offset = 2; offset <= 59; offset += 1) {
    await ctx.step(offset, BLIND);
  }
  await ctx.step(60, UP);
  const window = downtime(ctx.db, new Date(T0), new Date(T0 + 60 * 60_000));
  expect(window.outages).toBe(1);
  expect(window.downMinutes).toBe(3);
  expect(window.blindMinutes).toBe(57);
});

test('blind samples between downs do not push the first down out of the lookback', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  for (let offset = 1; offset <= 49; offset += 1) {
    await ctx.step(offset, BLIND);
  }
  const result = await ctx.step(50, DOWN);
  expect(result.opened).toBeDefined();
  expect(ctx.db.query('SELECT started_at FROM outages').get()).toStrictEqual({ started_at: minute(0) });
});

test('a 10 minute gap and blind samples both count as blind minutes', async () => {
  const ctx = setupTest();
  await ctx.step(0, UP);
  await ctx.step(10, UP);
  await ctx.step(11, BLIND);
  await ctx.step(12, UP);
  const window = downtime(ctx.db, new Date(T0), new Date(T0 + 12 * 60_000));
  expect(window.blindMinutes).toBe(8);
  expect(window.outages).toBe(0);
});

test('health: stale, open outage and no samples', async () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  expect(probeHealth(ctx.db, new Date(T0))).toMatchObject({ ok: true, line: expect.stringContaining('no samples') });
  await ctx.step(0, UP);
  expect(probeHealth(ctx.db, new Date(T0 + 3 * 60_000)).ok).toBe(true);
  expect(probeHealth(ctx.db, new Date(T0 + 6 * 60_000))).toMatchObject({ ok: false, line: expect.stringContaining('stopped') });
  await ctx.step(1, DOWN);
  await ctx.step(2, DOWN);
  expect(probeHealth(ctx.db, new Date(T0 + 3 * 60_000))).toMatchObject({ ok: false, line: expect.stringContaining('Nix is down since 12:01') });
});

test('health: a blind last sample is not reported as Nix up', async () => {
  const ctx = setupTest();
  await ctx.step(0, BLIND);
  const health = probeHealth(ctx.db, new Date(T0 + 1 * 60_000));
  expect(health.line).toContain('blind');
  expect(health.line).not.toContain('Nix up');
});

test('the recovery message counts blind minutes as blind, as downtime() does', async () => {
  const ctx = setupTest();
  await ctx.step(0, DOWN);
  await ctx.step(1, DOWN);
  for (let offset = 2; offset <= 59; offset += 1) {
    await ctx.step(offset, BLIND);
  }
  await ctx.step(60, UP);
  const window = downtime(ctx.db, new Date(T0), new Date(T0 + 60 * 60_000));
  const back = readOutboxRows(ctx.db).find((row) => row.target === 'z-stu')?.text;
  expect(back).toBe(`Nix is back: down ${window.downMinutes} min (12:00–13:00 Sydney; hq could not see ${window.blindMinutes} min of it (the PC was offline)).`);
  expect(window.downMinutes).toBeLessThan(5);
});

const UNREADY = { target: true, control: true, ready: false };

test('live and ready both fine opens nothing', async () => {
  const ctx = setupTest();
  for (let offset = 0; offset < 6; offset += 1) {
    const result = await ctx.step(offset, UP);
    expect(result.ready).toBe(true);
  }
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
});

test('ready failing for 2 minutes alerts nobody; at 3 minutes one alert goes to both, and later samples add none', async () => {
  const ctx = setupTest();
  await ctx.step(0, UP);
  await ctx.step(1, UNREADY);
  await ctx.step(2, UNREADY);
  await ctx.step(3, UNREADY);
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  const result = await ctx.step(4, UNREADY);
  expect(result.unreadyOpened).toBe(1);
  expect(readOutageRows(ctx.db).map((row) => [row.id, row.kind, row.started_at, row.detected_at, row.ended_at])).toStrictEqual([[1, 'unready', minute(1), minute(4), null]]);
  expect(readOutboxRows(ctx.db).map((row) => row.target)).toStrictEqual(['z-stu', 'z-delivery']);
  expect(readOutboxRows(ctx.db)[0]).toMatchObject({ topic: 'nix-unready', status: 'pending' });
  expect(readOutboxRows(ctx.db)[0]?.text).toBe('Nix is unready: https://target.invalid/ready failing since 12:01 (4 checks; /health/live is fine). hq checks every minute and tells you when it is ready again.');
  expect(readOutboxRows(ctx.db)[1]?.text).toBe(readOutboxRows(ctx.db)[0]?.text);
  expect(ctx.db.query("SELECT COUNT(*) AS count FROM events WHERE subject_id = 'probe' AND action = 'unready'").get()).toStrictEqual({ count: 1 });
  await ctx.step(5, UNREADY);
  await ctx.step(6, UNREADY);
  expect(readOutboxRows(ctx.db)).toHaveLength(2);
  expect(readOutageRows(ctx.db)).toHaveLength(1);
  expect(openUnready(ctx.db)?.id).toBe(1);
  expect(probeHealth(ctx.db, new Date(T0 + 7 * 60_000)).line).toContain('Nix up');
});

test('the unready alert is not held over quiet hours', async () => {
  const ctx = setupTest();
  const night = Date.parse('2026-10-16T14:00:00Z');
  for (let offset = 0; offset <= 3; offset += 1) {
    await ctx.probeAt(iso(new Date(night + offset * 60_000)), UNREADY);
  }
  expect(readOutboxRows(ctx.db).map((row) => [row.target, row.status])).toStrictEqual([['z-stu', 'pending'], ['z-delivery', 'pending']]);
});

test('the first ready sample closes the unready outage and says how long', async () => {
  const ctx = setupTest();
  for (let minuteIndex = 0; minuteIndex <= 4; minuteIndex++) {
    await ctx.step(minuteIndex, UNREADY);
  }
  const result = await ctx.step(5, UP);
  expect(result.unreadyClosed).toBe(1);
  expect(readOutageRows(ctx.db)[0]?.ended_at).toBe(minute(5));
  expect(ctx.db.query('SELECT recover_seq FROM outages').get()).toStrictEqual({ recover_seq: expect.any(Number) });
  expect(readOutboxRows(ctx.db).map((row) => [row.target, row.text])).toStrictEqual([
    ['z-stu', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
    ['z-delivery', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
  ]);
  await ctx.step(6, UP);
  expect(readOutboxRows(ctx.db)).toHaveLength(2);
});

test('a live failure during an unready outage does not close it, and coming back unready continues it', async () => {
  const ctx = setupTest();
  for (let offset = 0; offset <= 3; offset += 1) {
    await ctx.step(offset, UNREADY);
  }
  await ctx.step(4, DOWN);
  await ctx.step(5, DOWN);
  expect(readOutageRows(ctx.db).map((row) => [row.kind, row.ended_at])).toStrictEqual([['unready', null], ['down', null]]);
  const result = await ctx.step(6, UNREADY);
  expect(result.closed).toBe(2);
  expect(result.unreadyClosed).toBeUndefined();
  expect(readOutageRows(ctx.db).map((row) => [row.kind, row.ended_at === null])).toStrictEqual([['unready', true], ['down', false]]);
  expect(openUnready(ctx.db)?.id).toBe(1);
  await ctx.step(7, UP);
  expect(openUnready(ctx.db)).toBeNull();
});

test('a down and an unready outage are open together, and downtime counts only the down one', async () => {
  const ctx = setupTest();
  for (let offset = 0; offset <= 3; offset += 1) {
    await ctx.step(offset, UNREADY);
  }
  await ctx.step(4, DOWN);
  await ctx.step(5, DOWN);
  for (let offset = 6; offset <= 9; offset += 1) {
    await ctx.step(offset, DOWN);
  }
  expect(readOutageRows(ctx.db).map((row) => row.kind)).toStrictEqual(['unready', 'down']);
  const window = downtime(ctx.db, new Date(T0), new Date(T0 + 10 * 60_000));
  expect(window.outages).toBe(1);
  expect(window.downMinutes).toBe(6);
  expect(unreadyIn(ctx.db, new Date(T0), new Date(T0 + 10 * 60_000))).toHaveLength(1);
});

test('it skips down and blind samples in the unready run', async () => {
  const ctx = setupTest();
  await ctx.step(0, UNREADY);
  await ctx.step(1, DOWN);
  await ctx.step(2, BLIND);
  await ctx.step(3, UNREADY);
  expect(readOutageRows(ctx.db).map((row) => [row.kind, row.started_at])).toStrictEqual([['unready', minute(0)]]);
});

test('it ends the unready run at an up sample with no ready check', async () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  seedProbeSample({ db: ctx.db }, { at: minute(0) });
  await ctx.step(1, UNREADY);
  await ctx.step(2, UNREADY);
  await ctx.step(3, UNREADY);
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
  await ctx.step(4, UNREADY);
  expect(readOutageRows(ctx.db).map((row) => row.started_at)).toStrictEqual([minute(1)]);
});

test('a ready sample resets the run', async () => {
  const ctx = setupTest();
  await ctx.step(0, UNREADY);
  await ctx.step(1, UNREADY);
  await ctx.step(2, UP);
  await ctx.step(3, UNREADY);
  await ctx.step(4, UNREADY);
  expect(readOutageRows(ctx.db)).toStrictEqual([]);
});
