import { afterEach, beforeEach, expect, test } from 'bun:test';
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

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  process.env['HQ_PROBE_TARGET'] = 'https://target.invalid/live';
  process.env['HQ_PROBE_CONTROL'] = 'https://control.invalid/ok';
  process.env['HQ_PROBE_READY'] = 'https://target.invalid/ready';
  process.env['HQ_NOTIFY'] = 'off';
  at(NOON_SYDNEY);
});
afterEach(() => {
  delete process.env['HQ_NOTIFY'];
  delete process.env['HQ_PROBE_TARGET'];
  delete process.env['HQ_PROBE_CONTROL'];
  delete process.env['HQ_PROBE_READY'];
  cleanup();
});

const T0 = Date.parse(NOON_SYDNEY);
const minute = (m: number) => iso(new Date(T0 + m * 60_000));

const urls: string[] = [];
function fake(world: { target: boolean; control: boolean; ready?: boolean }): Fetcher {
  return async (url) => {
    urls.push(url);
    const ok = url.endsWith('/ready') ? (world.ready ?? true) : url.includes('target') ? world.target : world.control;
    return { ok, status: ok ? 200 : 503, ms: 12, ...(ok ? {} : { error: 'HTTP 503' }) };
  };
}
const UP = { target: true, control: true };
const DOWN = { target: false, control: true };
const BLIND = { target: false, control: false };

async function step(m: number, world: { target: boolean; control: boolean; ready?: boolean }) {
  at(minute(m));
  return probeOnce(db, fake(world), 'hq-probe');
}

test('samples are up, down or blind, and the control is fetched only when the target fails', async () => {
  urls.length = 0;
  expect((await step(0, UP)).state).toBe('up');
  expect(urls).toEqual(['https://target.invalid/live', 'https://target.invalid/ready']);
  urls.length = 0;
  expect((await step(1, DOWN)).state).toBe('down');
  expect(urls).toStrictEqual(['https://target.invalid/live', 'https://control.invalid/ok']);
  expect((await step(2, BLIND)).state).toBe('blind');
  expect(db.query('SELECT at, target_ok, control_ok, ready_ok FROM probe_samples ORDER BY at').all()).toEqual([
    { at: minute(0), target_ok: 1, control_ok: null, ready_ok: 1 },
    { at: minute(1), target_ok: 0, control_ok: 1, ready_ok: null },
    { at: minute(2), target_ok: 0, control_ok: 0, ready_ok: null },
  ]);
});

test('two downs open one outage dated from the first; a third queues nothing more', async () => {
  await step(0, UP);
  expect((await step(1, DOWN)).opened).toBeUndefined();
  expect(readOutboxRows(db)).toStrictEqual([]);
  const r = await step(2, DOWN);
  expect(r.opened).toBe(1);
  const [alert] = readEvents(db, 'hq', 'probe', ['outage']);
  expect(readOutageRows(db)).toStrictEqual([{ id: 1, started_at: minute(1), detected_at: minute(2), ended_at: null, alert_seq: alert?.seq ?? null, recover_seq: null, kind: 'down' }]);

  expect(readOutboxRows(db).map((row) => row.target)).toStrictEqual(['z-stu', 'z-delivery']);
  expect(readOutboxRows(db)[0]).toMatchObject({ topic: 'nix-outage', status: 'pending' });
  expect(readOutboxRows(db)[1]?.text).toBe(readOutboxRows(db)[0]?.text);
  expect(readOutboxRows(db)[0]?.text).toContain('Nix is down: https://target.invalid/live failing since 12:01 (2 checks; control URL fine)');
  await step(3, DOWN);
  expect(readOutboxRows(db)).toHaveLength(2);
  expect(readOutageRows(db)).toHaveLength(1);
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE subject = 'hq' AND subject_id = 'probe' AND action = 'outage'").get()).toEqual({ n: 1 });
});

test('a blind sample neither opens nor resets the run of downs', async () => {
  await step(0, DOWN);
  await step(1, BLIND);
  expect((await step(2, DOWN)).opened).toBe(1);
  expect(readOutageRows(db)[0]?.started_at).toBe(minute(0));
});

test('blind samples alone open nothing', async () => {
  for (let m = 0; m < 5; m++) await step(m, BLIND);
  expect(readOutageRows(db)).toStrictEqual([]);
});

test('an up sample resets the run', async () => {
  await step(0, DOWN);
  await step(1, UP);
  await step(2, DOWN);
  expect(readOutageRows(db)).toStrictEqual([]);
});

test('an up closes the outage and queues one recovery message', async () => {
  for (let minuteIndex = 0; minuteIndex <= 5; minuteIndex++) {
    await step(minuteIndex, DOWN);
  }
  const r = await step(6, UP);
  expect(r.closed).toBe(1);
  expect(readOutageRows(db)[0]?.ended_at).toBe(minute(6));
  expect(readOutboxRows(db).map((row) => [row.target, row.text])).toStrictEqual([
    ['z-stu', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
    ['z-delivery', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
  ]);
  await step(7, UP);
  expect(readOutboxRows(db)).toHaveLength(2);
});

test('a single down then up opens nothing', async () => {
  await step(0, DOWN);
  await step(1, UP);
  expect(readOutageRows(db)).toStrictEqual([]);
  expect(readOutboxRows(db)).toStrictEqual([]);
});

test('the probe sends nothing itself: the alert is queued for the command that ran it to send', async () => {
  takeQueued();
  await step(0, DOWN);
  await step(1, DOWN);
  expect(readOutboxRows(db).map((row) => row.status)).toStrictEqual(['pending', 'pending']);
  const ids = takeQueued();
  expect(ids).toHaveLength(2);
  expect(db.query(`SELECT DISTINCT topic FROM outbox WHERE id IN (${ids.join(',')})`).all()).toEqual([{ topic: 'nix-outage' }]);
});

test('health: one failed check with the control fine is not reported as Nix up', async () => {
  await step(0, DOWN);
  const h = probeHealth(db, new Date(T0 + 1 * 60_000));
  expect(h).toMatchObject({ ok: true, line: expect.stringContaining('last check 1 min ago failed (control fine); an outage opens after 2 failed checks in a row') });
});

test('samples older than the keep window are pruned', async () => {
  await step(0, UP);
  at(iso(new Date(T0 + (KEEP_DAYS + 1) * 86_400_000)));
  await probeOnce(db, fake(UP), 'hq-probe');
  expect(db.query('SELECT COUNT(*) AS n FROM probe_samples').get()).toEqual({ n: 1 });
});

test('downtime clips outages to the window, counts an open one to the end, and reports detection delay and blind time', async () => {
  for (let m = 0; m <= 4; m++) await step(m, UP);
  await step(5, DOWN);
  await step(6, DOWN);
  for (let m = 7; m <= 10; m++) await step(m, DOWN);
  await step(11, UP);
  for (let m = 12; m <= 14; m++) await step(m, UP);
  await step(15, DOWN);
  await step(16, DOWN);
  for (let m = 17; m <= 19; m++) await step(m, DOWN);
  const d = downtime(db, new Date(T0 + 8 * 60_000), new Date(T0 + 20 * 60_000));
  expect(d.outages).toBe(2);
  expect(d.downMinutes).toBe(3 + 5);
  expect(d.longestDetectMinutes).toBe(1);
  expect(d.samples).toBe(12);
  expect(d.blindMinutes).toBe(0);
});

test('blind minutes inside an outage are not counted as downtime', async () => {
  await step(0, DOWN);
  await step(1, DOWN);
  for (let m = 2; m <= 59; m++) await step(m, BLIND);
  await step(60, UP);
  const d = downtime(db, new Date(T0), new Date(T0 + 60 * 60_000));
  expect(d.outages).toBe(1);
  expect(d.downMinutes).toBe(3);
  expect(d.blindMinutes).toBe(57);
});

test('blind samples between downs do not push the first down out of the lookback', async () => {
  await step(0, DOWN);
  for (let m = 1; m <= 49; m++) await step(m, BLIND);
  const r = await step(50, DOWN);
  expect(r.opened).toBeDefined();
  expect(db.query('SELECT started_at FROM outages').get()).toEqual({ started_at: minute(0) });
});

test('a 10 minute gap and blind samples both count as blind minutes', async () => {
  await step(0, UP);
  await step(10, UP);
  await step(11, BLIND);
  await step(12, UP);
  const d = downtime(db, new Date(T0), new Date(T0 + 12 * 60_000));
  expect(d.blindMinutes).toBe(8);
  expect(d.outages).toBe(0);
});

test('health: stale, open outage and no samples', async () => {
  expect(probeHealth(db, new Date(T0))).toMatchObject({ ok: true, line: expect.stringContaining('no samples') });
  await step(0, UP);
  expect(probeHealth(db, new Date(T0 + 3 * 60_000)).ok).toBe(true);
  expect(probeHealth(db, new Date(T0 + 6 * 60_000))).toMatchObject({ ok: false, line: expect.stringContaining('stopped') });
  await step(1, DOWN);
  await step(2, DOWN);
  expect(probeHealth(db, new Date(T0 + 3 * 60_000))).toMatchObject({ ok: false, line: expect.stringContaining('Nix is down since 12:01') });
});

test('health: a blind last sample is not reported as Nix up', async () => {
  await step(0, BLIND);
  const h = probeHealth(db, new Date(T0 + 1 * 60_000));
  expect(h.line).toContain('blind');
  expect(h.line).not.toContain('Nix up');
});

test('the recovery message counts blind minutes as blind, as downtime() does', async () => {
  await step(0, DOWN);
  await step(1, DOWN);
  for (let m = 2; m <= 59; m++) await step(m, BLIND);
  await step(60, UP);
  const d = downtime(db, new Date(T0), new Date(T0 + 60 * 60_000));
  const back = readOutboxRows(db).find((row) => row.target === 'z-stu')?.text;
  expect(back).toBe(`Nix is back: down ${d.downMinutes} min (12:00–13:00 Sydney; hq could not see ${d.blindMinutes} min of it (the PC was offline)).`);
  expect(d.downMinutes).toBeLessThan(5);
});

const UNREADY = { target: true, control: true, ready: false };

test('live and ready both fine opens nothing', async () => {
  for (let m = 0; m < 6; m++) expect((await step(m, UP)).ready).toBe(true);
  expect(readOutageRows(db)).toStrictEqual([]);
  expect(readOutboxRows(db)).toStrictEqual([]);
});

test('ready failing for 2 minutes alerts nobody; at 3 minutes one alert goes to both, and later samples add none', async () => {
  await step(0, UP);
  await step(1, UNREADY);
  await step(2, UNREADY);
  await step(3, UNREADY);
  expect(readOutageRows(db)).toStrictEqual([]);
  expect(readOutboxRows(db)).toStrictEqual([]);
  const result = await step(4, UNREADY);
  expect(result.unreadyOpened).toBe(1);
  expect(readOutageRows(db).map((row) => [row.id, row.kind, row.started_at, row.detected_at, row.ended_at])).toStrictEqual([[1, 'unready', minute(1), minute(4), null]]);
  expect(readOutboxRows(db).map((row) => row.target)).toStrictEqual(['z-stu', 'z-delivery']);
  expect(readOutboxRows(db)[0]).toMatchObject({ topic: 'nix-unready', status: 'pending' });
  expect(readOutboxRows(db)[0]?.text).toBe('Nix is unready: https://target.invalid/ready failing since 12:01 (4 checks; /health/live is fine). hq checks every minute and tells you when it is ready again.');
  expect(readOutboxRows(db)[1]?.text).toBe(readOutboxRows(db)[0]?.text);
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE subject_id = 'probe' AND action = 'unready'").get()).toEqual({ n: 1 });
  await step(5, UNREADY);
  await step(6, UNREADY);
  expect(readOutboxRows(db)).toHaveLength(2);
  expect(readOutageRows(db)).toHaveLength(1);
  expect(openUnready(db)?.id).toBe(1);
  expect(probeHealth(db, new Date(T0 + 7 * 60_000)).line).toContain('Nix up');
});

test('the unready alert is not held over quiet hours', async () => {
  const night = Date.parse('2026-10-16T14:00:00Z');
  const go = async (m: number, w: { target: boolean; control: boolean; ready?: boolean }) => {
    at(iso(new Date(night + m * 60_000)));
    return probeOnce(db, fake(w), 'hq-probe');
  };
  for (let m = 0; m <= 3; m++) await go(m, UNREADY);
  expect(readOutboxRows(db).map((row) => [row.target, row.status])).toStrictEqual([['z-stu', 'pending'], ['z-delivery', 'pending']]);
});

test('the first ready sample closes the unready outage and says how long', async () => {
  for (let minuteIndex = 0; minuteIndex <= 4; minuteIndex++) {
    await step(minuteIndex, UNREADY);
  }
  const r = await step(5, UP);
  expect(r.unreadyClosed).toBe(1);
  expect(readOutageRows(db)[0]?.ended_at).toBe(minute(5));
  expect(db.query('SELECT recover_seq FROM outages').get()).toEqual({ recover_seq: expect.any(Number) });
  expect(readOutboxRows(db).map((row) => [row.target, row.text])).toStrictEqual([
    ['z-stu', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
    ['z-delivery', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
  ]);
  await step(6, UP);
  expect(readOutboxRows(db)).toHaveLength(2);
});

test('a live failure during an unready outage does not close it, and coming back unready continues it', async () => {
  for (let m = 0; m <= 3; m++) await step(m, UNREADY);
  await step(4, DOWN);
  await step(5, DOWN);
  expect(readOutageRows(db).map((row) => [row.kind, row.ended_at])).toStrictEqual([['unready', null], ['down', null]]);
  const result = await step(6, UNREADY);
  expect(result.closed).toBe(2);
  expect(result.unreadyClosed).toBeUndefined();
  expect(readOutageRows(db).map((row) => [row.kind, row.ended_at === null])).toStrictEqual([['unready', true], ['down', false]]);
  expect(openUnready(db)?.id).toBe(1);
  await step(7, UP);
  expect(openUnready(db)).toBeNull();
});

test('a down and an unready outage are open together, and downtime counts only the down one', async () => {
  for (let m = 0; m <= 3; m++) await step(m, UNREADY);
  await step(4, DOWN);
  await step(5, DOWN);
  for (let m = 6; m <= 9; m++) await step(m, DOWN);
  expect(readOutageRows(db).map((row) => row.kind)).toStrictEqual(['unready', 'down']);
  const d = downtime(db, new Date(T0), new Date(T0 + 10 * 60_000));
  expect(d.outages).toBe(1);
  expect(d.downMinutes).toBe(6);
  expect(unreadyIn(db, new Date(T0), new Date(T0 + 10 * 60_000))).toHaveLength(1);
});

test('it skips down and blind samples in the unready run', async () => {
  await step(0, UNREADY);
  await step(1, DOWN);
  await step(2, BLIND);
  await step(3, UNREADY);
  expect(readOutageRows(db).map((row) => [row.kind, row.started_at])).toStrictEqual([['unready', minute(0)]]);
});

test('it ends the unready run at an up sample with no ready check', async () => {
  seedProbeSample({ db }, { at: minute(0) });
  await step(1, UNREADY);
  await step(2, UNREADY);
  await step(3, UNREADY);
  expect(readOutageRows(db)).toStrictEqual([]);
  await step(4, UNREADY);
  expect(readOutageRows(db).map((row) => row.started_at)).toStrictEqual([minute(1)]);
});

test('a ready sample resets the run', async () => {
  await step(0, UNREADY);
  await step(1, UNREADY);
  await step(2, UP);
  await step(3, UNREADY);
  await step(4, UNREADY);
  expect(readOutageRows(db)).toStrictEqual([]);
});
