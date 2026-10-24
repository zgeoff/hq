import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { at, fetchedDays, freshDb } from '../../test/helpers.ts';
import { getUsageCache } from './get-usage-cache.ts';
import { getUsageDir } from './get-usage-dir.ts';
import { measure } from './measure.ts';
import { sampleUsage } from './sample-usage.ts';

let cleanup: () => void, db: Database, dir: string;

// The Sydney day of Fri 16 Oct 2026 (AEDT, UTC+11), judged at 18:00 Sydney.
const FROM = new Date('2026-10-15T13:00:00Z'),
  NOW = new Date('2026-10-16T07:00:00Z'),
  TO = new Date('2026-10-16T13:00:00Z'),
  home = process.env['HOME'],
  xdg = process.env['XDG_CACHE_HOME'];

beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HOME'] = dir;
  delete process.env['XDG_CACHE_HOME'];
  at(NOW.toISOString());
  fetchedDays(db);
});
afterEach(() => {
  process.env['HOME'] = home;
  if (xdg === undefined) {
    delete process.env['XDG_CACHE_HOME'];
  } else {
    process.env['XDG_CACHE_HOME'] = xdg;
  }
  cleanup();
});

function cache(body: unknown, raw = false) {
  const f = getUsageCache();
  mkdirSync(f.slice(0, f.lastIndexOf('/')), { recursive: true });
  writeFileSync(f, raw ? String(body) : JSON.stringify(body));
}
const rows = () => db.query('SELECT at, account, five_hour, seven_day FROM usage_samples ORDER BY at').all();

test('a new reading stores one row; an unchanged one stores none', () => {
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 } });
  expect(sampleUsage(db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  expect(sampleUsage(db, new Date('2026-10-16T01:05:00Z'))).toBe(false);
  expect(rows()).toEqual([{ at: '2026-10-16T01:00:00Z', account: 'active', five_hour: 18, seven_day: 62 }]);
  cache({ used: 63, windows: { fiveHour: 20, sevenDay: 63 } });
  expect(sampleUsage(db, new Date('2026-10-16T01:10:00Z'))).toBe(true);
  expect(rows()).toHaveLength(2);
});

test('a reading names its account when the cache does', () => {
  cache({ account: 'abcdef012345', windows: { fiveHour: 1, sevenDay: 2 } });
  sampleUsage(db);
  cache({ account: 'not a hash', windows: { fiveHour: 5, sevenDay: 6 } });
  sampleUsage(db, new Date('2026-10-16T07:01:00Z'));
  expect(rows().map((r) => (r as { account: string }).account)).toEqual(['abcdef012345', 'active']);
});

test('a missing, unreadable or empty cache stores nothing and says nothing', () => {
  expect(sampleUsage(db)).toBe(false);
  cache('{not json', true);
  expect(sampleUsage(db)).toBe(false);
  cache({ error: 'Claude usage endpoint failed' });
  expect(sampleUsage(db)).toBe(false);
  cache({ windows: { fiveHour: 'lots', sevenDay: -4 } });
  expect(sampleUsage(db)).toBe(false);
  expect(rows()).toEqual([]);
  rmSync(getUsageCache());
});

test('XDG_CACHE_HOME moves the cache file', () => {
  process.env['XDG_CACHE_HOME'] = `${dir}/xdg`;
  expect(getUsageCache()).toBe(`${dir}/xdg/z-capacity/claude-usage.json`);
});

test('switching account A to B and back to A with unchanged figures stores A again, and cost reports A', () => {
  const w = { fiveHour: 10, sevenDay: 40 };
  cache({ account: 'aaaaaaaaaaaa', windows: w });
  expect(sampleUsage(db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  cache({ account: 'bbbbbbbbbbbb', windows: { fiveHour: 50, sevenDay: 90 } });
  expect(sampleUsage(db, new Date('2026-10-16T02:00:00Z'))).toBe(true);
  cache({ account: 'aaaaaaaaaaaa', windows: w });
  expect(sampleUsage(db, new Date('2026-10-16T03:00:00Z'))).toBe(true);
  expect(sampleUsage(db, new Date('2026-10-16T04:00:00Z'))).toBe(false); // same account, same figures
  expect(rows()).toHaveLength(3);
  expect(measure(db, FROM, TO, NOW).cost).toMatchObject({ value: 40, n: 2 });
});

function accountFile(name: string, body: unknown, mtime: string) {
  mkdirSync(getUsageDir(), { recursive: true });
  const f = `${getUsageDir()}/${name}.json`;
  writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body));
  utimesSync(f, new Date(mtime), new Date(mtime));
}
const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';

test('two account files give two rows, stamped with the file mtime; an unchanged mtime gives none', () => {
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 } }, '2026-10-16T01:00:00Z');
  accountFile(B, { account: B, windows: { fiveHour: 50, sevenDay: 90 } }, '2026-10-16T02:00:00Z');
  expect(sampleUsage(db, new Date('2026-10-16T05:00:00Z'))).toBe(true);
  expect(rows()).toEqual([
    { at: '2026-10-16T01:00:00Z', account: A, five_hour: 10, seven_day: 40 },
    { at: '2026-10-16T02:00:00Z', account: B, five_hour: 50, seven_day: 90 },
  ]);
  expect(sampleUsage(db, new Date('2026-10-16T05:05:00Z'))).toBe(false);
  expect(rows()).toHaveLength(2);
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 } }, '2026-10-16T03:00:00Z'); // a newer reading, even with the same figures
  expect(sampleUsage(db, new Date('2026-10-16T05:10:00Z'))).toBe(true);
  expect(rows()).toHaveLength(3);
});

test('a file with a bad name, a bad account, a mismatched account or no figures is skipped without a word', () => {
  accountFile(A, { account: B, windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z'); // names another account
  accountFile('ABCDEFABCDEF', { account: 'ABCDEFABCDEF', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('geoff@example.com', { account: 'geoff@example.com', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('short', { account: 'short', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile(B, { windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z'); // names none
  accountFile('cccccccccccc', '{not json', '2026-10-16T01:00:00Z');
  accountFile('dddddddddddd', { account: 'dddddddddddd', windows: { fiveHour: 'lots' } }, '2026-10-16T01:00:00Z');
  expect(sampleUsage(db, new Date('2026-10-16T05:00:00Z'))).toBe(false);
  expect(rows()).toEqual([]);
});

test('with no folder, or an empty one, the old single file is read as before', () => {
  cache({ account: A, windows: { fiveHour: 18, sevenDay: 62 } });
  expect(sampleUsage(db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  mkdirSync(getUsageDir(), { recursive: true });
  cache({ windows: { fiveHour: 20, sevenDay: 63 } });
  expect(sampleUsage(db, new Date('2026-10-16T02:00:00Z'))).toBe(true);
  expect(rows()).toEqual([
    { at: '2026-10-16T01:00:00Z', account: A, five_hour: 18, seven_day: 62 },
    { at: '2026-10-16T02:00:00Z', account: 'active', five_hour: 20, seven_day: 63 },
  ]);
});

test('once the folder holds account files, the old single file is left alone', () => {
  cache({ account: A, windows: { fiveHour: 99, sevenDay: 99 } });
  accountFile(B, { account: B, windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  sampleUsage(db, new Date('2026-10-16T05:00:00Z'));
  expect(rows().map((r) => (r as { account: string }).account)).toEqual([B]);
});

test('it lets a failed insert of an account reading reach the caller', () => {
  mkdirSync(getUsageDir(), { recursive: true });
  writeFileSync(`${getUsageDir()}/abcdef012345.json`, JSON.stringify({ account: 'abcdef012345', windows: { fiveHour: 1, sevenDay: 2 } }));
  db.run(`CREATE TRIGGER refuse_usage BEFORE INSERT ON usage_samples BEGIN SELECT RAISE(ABORT, 'invented full database'); END`);

  expect(() => sampleUsage(db)).toThrow('invented full database');
});

test("an account file's reset times are stored per window, and a reset that is not a time is left out", () => {
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 }, resets: { fiveHour: '2026-10-16T05:00:00.123456+00:00', sevenDay: 'October 20, 2026 08:00:00 GMT' } }, '2026-10-16T01:00:00Z');
  sampleUsage(db, new Date('2026-10-16T05:00:00Z'));
  expect(db.query('SELECT account, five_hour_resets_at, seven_day_resets_at FROM usage_samples').all()).toStrictEqual([{ account: A, five_hour_resets_at: '2026-10-16T05:00:00Z', seven_day_resets_at: null }]);
});

test('the single cache file stores its reset times too', () => {
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 }, resets: { fiveHour: '2026-10-16T04:00:00Z', sevenDay: '2026-10-20T08:00:00Z' } });
  sampleUsage(db, new Date('2026-10-16T01:00:00Z'));
  expect(db.query('SELECT five_hour_resets_at, seven_day_resets_at FROM usage_samples').all()).toStrictEqual([{ five_hour_resets_at: '2026-10-16T04:00:00Z', seven_day_resets_at: '2026-10-20T08:00:00Z' }]);
});
