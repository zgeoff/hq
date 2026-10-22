import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { morningCheck } from '../src/morning/morning-check.ts';
import { morningText } from '../src/morning/morning-text.ts';
import { morningTick } from '../src/morning/morning-tick.ts';
import { recentRuns } from '../src/morning/recent-runs.ts';
import { skipMorning } from '../src/morning/skip-morning.ts';
import { sydneyUtc } from '../src/morning/sydney-utc.ts';
import { sydney } from '../src/morning/sydney.ts';
import { windows } from '../src/morning/windows.ts';
import { at, freshDb } from './helpers.ts';
import { setForward } from '../src/outbox/set-forward.ts';

let db: Database;
let cleanup: () => void;
const syd = (date: string, hm: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return sydneyUtc(y!, mo!, d!, h!, mi!);
};
const outbox = () => db.query('SELECT target, text, status, topic FROM outbox').all() as { target: string; text: string; status: string; topic: string }[];

beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at('2026-10-16T01:00:00Z');
});
afterEach(() => cleanup());

test('Sydney wall clock to UTC, across the October DST change', () => {
  expect(sydneyUtc(2026, 10, 3).toISOString()).toBe('2026-10-02T14:00:00.000Z'); // AEST, +10
  expect(sydneyUtc(2026, 10, 5).toISOString()).toBe('2026-10-04T13:00:00.000Z'); // AEDT, +11
  expect(sydneyUtc(2026, 10, 16, 8, 30).toISOString()).toBe('2026-10-15T21:30:00.000Z');
  expect(sydney(new Date('2026-10-15T21:15:00Z'))).toMatchObject({ date: '2026-10-16', h: 8, mi: 15 });
});

test('the windows: all of yesterday and today to 08:30, a 23-hour day at the DST change', () => {
  const w = windows(syd('2026-10-05', '08:15'));
  expect(w.date).toBe('2026-10-05');
  expect(w.yesterday.from.toISOString()).toBe('2026-10-03T14:00:00.000Z');
  expect(w.yesterday.to.toISOString()).toBe('2026-10-04T13:00:00.000Z');
  expect(w.today.to.toISOString()).toBe('2026-10-04T21:30:00.000Z');
  expect(morningText(windows(syd('2026-10-17', '08:15')), false)).toBe(
    [
      'Morning reports due. Both windows are in Sydney time:',
      '1. Yesterday, Fri, 16 Oct 00:00–24:00 (2026-10-15T13:00Z to 2026-10-16T13:00Z).',
      '2. Today so far, Sat, 17 Oct 00:00–08:30 (2026-10-16T13:00Z to 2026-10-16T21:30Z).',
    ].join('\n'),
  );
});

test('fires once per Sydney day from 08:15, queued to z-stu; late after 08:45', () => {
  expect(morningTick(db, 'hq-lanes', syd('2026-10-17', '08:14'))).toBeNull();
  const r = morningTick(db, 'hq-lanes', syd('2026-10-17', '08:16'))!;
  expect(r).toMatchObject({ job: 'morning-reports', key: '2026-10-17', result: 'queued', detail: null });
  expect(outbox()).toEqual([{ target: 'z-stu', text: expect.stringContaining('Morning reports due. Both windows'), status: 'pending', topic: 'job:morning-reports:2026-10-17' }]);
  expect(morningTick(db, 'hq-lanes', syd('2026-10-17', '08:21'))).toBeNull();
  expect(morningTick(db, 'hq-lanes', syd('2026-10-17', '23:59'))).toBeNull();
  const late = morningTick(db, 'hq-lanes', syd('2026-10-18', '09:30'))!;
  expect(late).toMatchObject({ key: '2026-10-18', detail: 'late' });
  expect(outbox().at(-1)!.text).toContain('Morning reports due (late: hq did not run at 08:15)');
  expect(recentRuns(db).map((x) => [x.key, x.result, x.sent])).toEqual([
    ['2026-10-18', 'queued', 'pending'],
    ['2026-10-17', 'queued', 'pending'],
  ]);
});

test('a skipped morning is left alone; bad skips are refused', () => {
  skipMorning(db, '2026-10-16', 'z-stu ran them by hand', 'z-q');
  expect(morningTick(db, 'hq-lanes', syd('2026-10-16', '09:00'))).toBeNull();
  expect(outbox()).toEqual([]);
  expect(() => skipMorning(db, '2026-10-16', 'again', 'z-q')).toThrow('already ran (skipped');
  for (const d of ['16/10/2026', '2026-10-16; DROP TABLE job_runs', 'today', '2026-13-40', '2026-02-30', '2026-1-05', '']) expect(() => skipMorning(db, d, 'x', 'z-q')).toThrow('--date');
  expect(() => skipMorning(db, '2026-10-19', '  ', 'z-q')).toThrow('--reason');
});

test('hq health: quiet before 08:45, then flags a missing run or a failed send', () => {
  expect(morningCheck(db, syd('2026-10-17', '08:40'))).toBeNull();
  expect(morningCheck(db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('no run today (2026-10-17)') });
  morningTick(db, 'hq-lanes', syd('2026-10-17', '08:16'));
  expect(morningCheck(db, syd('2026-10-17', '08:50'))!.ok).toBe(true);
  db.query(`UPDATE outbox SET status = 'failed'`).run();
  expect(morningCheck(db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
  skipMorning(db, '2026-10-18', 'holiday', 'z-q');
  expect(morningCheck(db, syd('2026-10-18', '10:00'))).toMatchObject({ ok: true, line: expect.stringContaining('skipped') });
  // A skip for a later day doesn't hide today's run from the check.
  skipMorning(db, '2026-10-25', 'away', 'z-q');
  morningTick(db, 'hq-lanes', syd('2026-10-19', '08:16'));
  expect(morningCheck(db, syd('2026-10-19', '09:00'))).toMatchObject({ ok: true, line: expect.stringContaining('queued today') });
});

test('it sees a failed morning message queued while the owner session is forwarded', () => {
  setForward(db, 'z-stu', 'z-other');
  morningTick(db, 'hq-lanes', syd('2026-10-17', '08:16'));
  db.query(`UPDATE outbox SET status = 'failed'`).run();

  expect(morningCheck(db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('it lists the send status of a morning message forwarded after it was queued', () => {
  morningTick(db, 'hq-lanes', syd('2026-10-17', '08:16'));
  setForward(db, 'z-stu', 'z-other');

  expect(recentRuns(db).map((run) => [run.key, run.sent])).toStrictEqual([['2026-10-17', 'pending']]);
});
