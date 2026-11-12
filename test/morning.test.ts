import { z } from 'zod';
import { expect, onTestFinished, test } from 'bun:test';
import { morningCheck } from '../src/morning/morning-check.ts';
import { morningText } from '../src/morning/morning-text.ts';
import { morningTick } from '../src/morning/morning-tick.ts';
import { recentRuns } from '../src/morning/recent-runs.ts';
import { skipMorning } from '../src/morning/skip-morning.ts';
import { sydneyUtc } from '../src/morning/sydney-utc.ts';
import { sydney } from '../src/morning/sydney.ts';
import { windows } from '../src/morning/windows.ts';
import { at, freshDb } from './helpers.ts';
import { readOutboxRows } from '../src/outbox/read-outbox-rows.ts';
import { setForward } from '../src/outbox/set-forward.ts';
import { markOutboxFailed } from '../src/outbox/mark-outbox-failed.ts';
import { unsent } from '../src/outbox/unsent.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';

function setupTest() {
  const base = freshDb();
  onTestFinished(base.cleanup);
  at('2026-10-16T01:00:00Z');

  return { db: base.db, seed: buildSeeder(base) };
}

const syd = (date: string, hm: string) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return sydneyUtc(y!, mo!, d!, h!, mi!);
};

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

test('it fires once per Sydney day from 08:15, queued to stu; late after 08:45', () => {
  const ctx = setupTest();
  expect(morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:14'))).toBeNull();
  const result = morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:16'));
  expect(result).toMatchObject({ job: 'morning-reports', key: '2026-10-17', result: 'queued', detail: null });
  const queued = readOutboxRows(ctx.db);
  expect(queued.map((row) => ({ target: row.target, status: row.status, topic: row.topic }))).toStrictEqual([{ target: 'stu', status: 'pending', topic: 'job:morning-reports:2026-10-17' }]);
  expect(queued[0]?.text).toContain('Morning reports due. Both windows');
  expect(morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:21'))).toBeNull();
  expect(morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '23:59'))).toBeNull();
  const late = morningTick(ctx.db, 'hq-lanes', syd('2026-10-18', '09:30'));
  expect(late).toMatchObject({ key: '2026-10-18', detail: 'late' });
  expect(readOutboxRows(ctx.db).at(-1)?.text).toContain('Morning reports due (late: hq did not run at 08:15)');
  expect(recentRuns(ctx.db).map((run) => [run.key, run.result, run.sent])).toStrictEqual([
    ['2026-10-18', 'queued', 'pending'],
    ['2026-10-17', 'queued', 'pending'],
  ]);
});

test('a skipped morning is left alone; bad skips are refused', () => {
  const ctx = setupTest();
  skipMorning(ctx.db, '2026-10-16', 'stu ran them by hand', 'z-q');
  expect(morningTick(ctx.db, 'hq-lanes', syd('2026-10-16', '09:00'))).toBeNull();
  expect(readOutboxRows(ctx.db)).toStrictEqual([]);
  expect(() => skipMorning(ctx.db, '2026-10-16', 'again', 'z-q')).toThrow('already ran (skipped');
  for (const date of ['16/10/2026', '2026-10-16; DROP TABLE job_runs', 'today', '2026-13-40', '2026-02-30', '2026-1-05', '']) {
    expect(() => skipMorning(ctx.db, date, 'x', 'z-q')).toThrow('--date');
  }
  expect(() => skipMorning(ctx.db, '2026-10-19', '  ', 'z-q')).toThrow('--reason');
});

test('hq health: quiet before 08:45, then flags a missing run or a failed send', () => {
  const ctx = setupTest();
  expect(morningCheck(ctx.db, syd('2026-10-17', '08:40'))).toBeNull();
  expect(morningCheck(ctx.db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('no run today (2026-10-17)') });
  morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:16'));
  expect(morningCheck(ctx.db, syd('2026-10-17', '08:50'))?.ok).toBe(true);
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'invented send failure');
  expect(morningCheck(ctx.db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
  skipMorning(ctx.db, '2026-10-18', 'holiday', 'z-q');
  expect(morningCheck(ctx.db, syd('2026-10-18', '10:00'))).toMatchObject({ ok: true, line: expect.stringContaining('skipped') });
  skipMorning(ctx.db, '2026-10-25', 'away', 'z-q');
  morningTick(ctx.db, 'hq-lanes', syd('2026-10-19', '08:16'));
  expect(morningCheck(ctx.db, syd('2026-10-19', '09:00'))).toMatchObject({ ok: true, line: expect.stringContaining('queued today') });
});

test('it sees a failed morning message queued while the owner session is forwarded', () => {
  const ctx = setupTest();
  setForward(ctx.db, 'stu', 'z-other');
  morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:16'));
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'invented send failure');

  expect(morningCheck(ctx.db, syd('2026-10-17', '08:50'))).toMatchObject({ ok: false, line: expect.stringContaining('failed to send') });
});

test('it lists the send status of a morning message forwarded after it was queued', () => {
  const ctx = setupTest();
  morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:16'));
  setForward(ctx.db, 'stu', 'z-other');

  expect(recentRuns(ctx.db).map((run) => [run.key, run.sent])).toStrictEqual([['2026-10-17', 'pending']]);
});

test('it links a morning run queued under a forward to its event alone', () => {
  const ctx = setupTest();
  setForward(ctx.db, 'stu', 'z-other');
  morningTick(ctx.db, 'hq-lanes', syd('2026-10-17', '08:16'));
  const queuedRow = ctx.db.query('SELECT event_seq FROM outbox').get();

  expect(recentRuns(ctx.db).map((run) => [run.key, run.outbox_key, run.sent])).toStrictEqual([['2026-10-17', `hq-ev${z.object({ event_seq: z.number() }).parse(queuedRow).event_seq}`, 'pending']]);
});

test('it reads the send status of a morning run whose key also names the target', () => {
  const ctx = setupTest();
  setForward(ctx.db, 'stu', 'z-other');
  const item = ctx.seed.outboxItem({ target: 'stu' });
  ctx.seed.morningRunKeyedToTarget({ key: '2026-10-17', outbox_key: `hq-ev${item.event_seq}-stu` });
  markOutboxFailed(ctx.db, unsent(ctx.db, false, undefined), 'invented send failure');

  expect(recentRuns(ctx.db).map((run) => [run.key, run.sent])).toStrictEqual([['2026-10-17', 'failed']]);
});
