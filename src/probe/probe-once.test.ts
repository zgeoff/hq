import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { takeQueued } from '../outbox/take-queued.ts';
import { downtime } from './downtime.ts';
import { KEEP_DAYS } from './keep-days.ts';
import { openUnready } from './open-unready.ts';
import { probeHealth } from './probe-health.ts';
import { probeOnce } from './probe-once.ts';
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
const outbox = () => db.query('SELECT target, text, topic, status FROM outbox ORDER BY id').all() as { target: string; text: string; topic: string; status: string }[];
const outages = () => db.query('SELECT * FROM outages ORDER BY id').all() as { id: number; kind: string; alert_seq: number | null; recover_seq: number | null; started_at: string; detected_at: string; ended_at: string | null }[];

test('samples are up, down or blind, and the control is fetched only when the target fails', async () => {
  urls.length = 0;
  expect((await step(0, UP)).state).toBe('up');
  expect(urls).toEqual(['https://target.invalid/live', 'https://target.invalid/ready']);
  urls.length = 0;
  expect((await step(1, DOWN)).state).toBe('down');
  expect(urls).toEqual(['https://target.invalid/live', 'https://control.invalid/ok']); // ready is not fetched while live fails
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
  expect(outbox()).toEqual([]);
  const r = await step(2, DOWN);
  expect(r.opened).toBe(1);
  expect(outages()).toEqual([{ id: 1, started_at: minute(1), detected_at: minute(2), ended_at: null, alert_seq: expect.any(Number), recover_seq: null, kind: 'down' }]);

  // z-stu decides whether to wake the owner; z-delivery starts the fix (GEO-1104)
  expect(outbox().map((o) => o.target)).toEqual(['z-stu', 'z-delivery']);
  expect(outbox()[0]).toMatchObject({ topic: 'nix-outage', status: 'pending' });
  expect(outbox()[1]!.text).toBe(outbox()[0]!.text);
  expect(outbox()[0]!.text).toContain('Nix is down: https://target.invalid/live failing since 12:01 (2 checks; control URL fine)');
  await step(3, DOWN);
  expect(outbox()).toHaveLength(2);
  expect(outages()).toHaveLength(1);
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE subject = 'hq' AND subject_id = 'probe' AND action = 'outage'").get()).toEqual({ n: 1 });
});

test('a blind sample neither opens nor resets the run of downs', async () => {
  await step(0, DOWN);
  await step(1, BLIND);
  expect((await step(2, DOWN)).opened).toBe(1);
  expect(outages()[0]!.started_at).toBe(minute(0));
});

test('blind samples alone open nothing', async () => {
  for (let m = 0; m < 5; m++) await step(m, BLIND);
  expect(outages()).toEqual([]);
});

test('an up sample resets the run', async () => {
  await step(0, DOWN);
  await step(1, UP);
  await step(2, DOWN);
  expect(outages()).toEqual([]);
});

test('an up closes the outage and queues one recovery message', async () => {
  for (let m = 0; m <= 5; m++) await step(m, DOWN); // a check every minute, as the timer runs
  const r = await step(6, UP);
  expect(r.closed).toBe(1);
  expect(outages()[0]!.ended_at).toBe(minute(6));
  // the unsent outage alert and the recovery share a topic: only the newest is kept
  expect(outbox().map((o) => [o.target, o.text])).toEqual([
    ['z-stu', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
    ['z-delivery', 'Nix is back: down 6 min (12:00–12:06 Sydney).'],
  ]);
  await step(7, UP);
  expect(outbox()).toHaveLength(2);
});

test('a single down then up opens nothing', async () => {
  await step(0, DOWN);
  await step(1, UP);
  expect(outages()).toEqual([]);
  expect(outbox()).toEqual([]);
});

test('the probe sends nothing itself: the alert is queued for the command that ran it to send', async () => {
  takeQueued();
  await step(0, DOWN);
  await step(1, DOWN);
  expect(outbox().map((o) => o.status)).toEqual(['pending', 'pending']);
  const ids = takeQueued(); // what main() sends through send() as `hq probe run` ends
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
  await step(6, DOWN); // outage 1 opens at minute 5, detected at 6
  for (let m = 7; m <= 10; m++) await step(m, DOWN);
  await step(11, UP); // closes at 11
  for (let m = 12; m <= 14; m++) await step(m, UP);
  await step(15, DOWN);
  await step(16, DOWN); // outage 2 opens at 15, still open
  for (let m = 17; m <= 19; m++) await step(m, DOWN);
  const d = downtime(db, new Date(T0 + 8 * 60_000), new Date(T0 + 20 * 60_000));
  expect(d.outages).toBe(2);
  expect(d.downMinutes).toBe(3 + 5); // 8-11 clipped, then 15-20 open
  expect(d.longestDetectMinutes).toBe(1);
  expect(d.samples).toBe(12); // minutes 8-19
  expect(d.blindMinutes).toBe(0); // a sample every minute covers the whole window
});

test('blind minutes inside an outage are not counted as downtime', async () => {
  await step(0, DOWN);
  await step(1, DOWN);
  for (let m = 2; m <= 59; m++) await step(m, BLIND);
  await step(60, UP);
  const d = downtime(db, new Date(T0), new Date(T0 + 60 * 60_000));
  expect(d.outages).toBe(1);
  expect(d.downMinutes).toBe(3); // down samples at 0 and 1 cover 0-3
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
  // 0-2 and 10-11 covered, 11 is blind but 10 covers to 12; 12 itself covers nothing in the window
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
  const back = outbox().find((o) => o.target === 'z-stu')!.text;
  expect(back).toBe(`Nix is back: down ${d.downMinutes} min (12:00–13:00 Sydney; hq could not see ${d.blindMinutes} min of it (the PC was offline)).`);
  expect(d.downMinutes).toBeLessThan(5);
});

// Unready: Nix answers live but not ready (GEO-1142).
const UNREADY = { target: true, control: true, ready: false };
const kinds = () => db.query('SELECT id, kind, started_at, detected_at, ended_at FROM outages ORDER BY id').all() as { id: number; kind: string; started_at: string; detected_at: string; ended_at: string | null }[];

test('live and ready both fine opens nothing', async () => {
  for (let m = 0; m < 6; m++) expect((await step(m, UP)).ready).toBe(true);
  expect(kinds()).toEqual([]);
  expect(outbox()).toEqual([]);
});

test('ready failing for 2 minutes alerts nobody; at 3 minutes one alert goes to both, and later samples add none', async () => {
  await step(0, UP);
  await step(1, UNREADY);
  await step(2, UNREADY);
  await step(3, UNREADY); // failing since minute 1: 2 minutes
  expect(kinds()).toEqual([]);
  expect(outbox()).toEqual([]);
  const r = await step(4, UNREADY); // 3 minutes
  expect(r.unreadyOpened).toBe(1);
  expect(kinds()).toEqual([{ id: 1, kind: 'unready', started_at: minute(1), detected_at: minute(4), ended_at: null }]);
  expect(outbox().map((o) => o.target)).toEqual(['z-stu', 'z-delivery']);
  expect(outbox()[0]).toMatchObject({ topic: 'nix-unready', status: 'pending' });
  expect(outbox()[0]!.text).toBe('Nix is unready: https://target.invalid/ready failing since 12:01 (4 checks; /health/live is fine). hq checks every minute and tells you when it is ready again.');
  expect(outbox()[1]!.text).toBe(outbox()[0]!.text);
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE subject_id = 'probe' AND action = 'unready'").get()).toEqual({ n: 1 });
  await step(5, UNREADY);
  await step(6, UNREADY);
  expect(outbox()).toHaveLength(2);
  expect(kinds()).toHaveLength(1);
  expect(openUnready(db)?.id).toBe(1);
  expect(probeHealth(db, new Date(T0 + 7 * 60_000)).line).toContain('Nix up'); // hq health stays about live and down
});

test('the unready alert is not held over quiet hours', async () => {
  const night = Date.parse('2026-10-16T14:00:00Z'); // 01:00 Sydney
  const go = async (m: number, w: { target: boolean; control: boolean; ready?: boolean }) => {
    at(iso(new Date(night + m * 60_000)));
    return probeOnce(db, fake(w), 'hq-probe');
  };
  for (let m = 0; m <= 3; m++) await go(m, UNREADY);
  expect(outbox().map((o) => [o.target, o.status])).toEqual([['z-stu', 'pending'], ['z-delivery', 'pending']]);
});

test('the first ready sample closes the unready outage and says how long', async () => {
  for (let m = 0; m <= 4; m++) await step(m, UNREADY); // opens at 3
  const r = await step(5, UP);
  expect(r.unreadyClosed).toBe(1);
  expect(kinds()[0]!.ended_at).toBe(minute(5));
  expect(db.query('SELECT recover_seq FROM outages').get()).toEqual({ recover_seq: expect.any(Number) });
  expect(outbox().map((o) => [o.target, o.text])).toEqual([
    ['z-stu', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
    ['z-delivery', 'Nix is ready again: unready 5 min (12:00–12:05 Sydney).'],
  ]);
  await step(6, UP);
  expect(outbox()).toHaveLength(2);
});

test('a live failure during an unready outage does not close it, and coming back unready continues it', async () => {
  for (let m = 0; m <= 3; m++) await step(m, UNREADY);
  await step(4, DOWN);
  await step(5, DOWN); // a down outage opens beside the unready one
  expect(kinds().map((k) => [k.kind, k.ended_at])).toEqual([['unready', null], ['down', null]]);
  const r = await step(6, UNREADY); // live is back, ready is not: the down outage closes, the unready one goes on
  expect(r.closed).toBe(2);
  expect(r.unreadyClosed).toBeUndefined();
  expect(kinds().map((k) => [k.kind, k.ended_at === null])).toEqual([['unready', true], ['down', false]]);
  expect(openUnready(db)?.id).toBe(1);
  await step(7, UP);
  expect(openUnready(db)).toBeNull();
});

test('a down and an unready outage are open together, and downtime counts only the down one', async () => {
  for (let m = 0; m <= 3; m++) await step(m, UNREADY);
  await step(4, DOWN);
  await step(5, DOWN);
  for (let m = 6; m <= 9; m++) await step(m, DOWN);
  expect(kinds().map((k) => k.kind)).toEqual(['unready', 'down']);
  const d = downtime(db, new Date(T0), new Date(T0 + 10 * 60_000));
  expect(d.outages).toBe(1);
  expect(d.downMinutes).toBe(6); // down samples at 4-9 cover 4-10; the unready minutes 0-3 are not downtime
  expect(unreadyIn(db, new Date(T0), new Date(T0 + 10 * 60_000))).toHaveLength(1);
});

test('down and blind samples are skipped by the unready run, and an up one before v19 ends it', async () => {
  await step(0, UNREADY);
  await step(1, DOWN);
  await step(2, BLIND);
  await step(3, UNREADY); // the run is minutes 0 and 3: 3 minutes old at 3
  expect(kinds().map((k) => [k.kind, k.started_at])).toEqual([['unready', minute(0)]]);
  db.query('DELETE FROM outages').run();
  db.query('DELETE FROM probe_samples').run();
  db.query('INSERT INTO probe_samples (at, target_ok, control_ok, ready_ok) VALUES (?, 1, NULL, NULL)').run(minute(0)); // from before v19
  await step(1, UNREADY);
  await step(2, UNREADY);
  await step(3, UNREADY);
  expect(kinds()).toEqual([]); // the run starts at minute 1, only 2 minutes old
  await step(4, UNREADY);
  expect(kinds().map((k) => k.started_at)).toEqual([minute(1)]);
});

test('a ready sample resets the run', async () => {
  await step(0, UNREADY);
  await step(1, UNREADY);
  await step(2, UP);
  await step(3, UNREADY);
  await step(4, UNREADY);
  expect(kinds()).toEqual([]);
});
