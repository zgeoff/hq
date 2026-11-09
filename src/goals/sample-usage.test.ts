import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { at, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { getUsageCache } from './get-usage-cache.ts';
import { getUsageDir } from './get-usage-dir.ts';
import { measure } from './measure.ts';
import { sampleUsage } from './sample-usage.ts';

function setupTest() {
  const base = freshDb();
  const savedCacheHome = process.env['XDG_CACHE_HOME'];
  onTestFinished(base.cleanup);
  onTestFinished(overrideEnv('HOME', base.dir));
  delete process.env['XDG_CACHE_HOME'];
  onTestFinished(() => {
    if (savedCacheHome === undefined) {
      delete process.env['XDG_CACHE_HOME'];
    } else {
      process.env['XDG_CACHE_HOME'] = savedCacheHome;
    }
  });
  at('2026-10-16T07:00:00.000Z');

  return {
    db: base.db,
    directory: base.dir,
    readRows: () => z.array(z.object({ at: z.string(), account: z.string(), five_hour: z.number().nullable(), seven_day: z.number().nullable() })).parse(base.db.query('SELECT at, account, five_hour, seven_day FROM usage_samples ORDER BY at').all()),
  };
}

function cache(body: unknown, raw = false) {
  const f = getUsageCache();
  mkdirSync(f.slice(0, f.lastIndexOf('/')), { recursive: true });
  writeFileSync(f, raw ? String(body) : JSON.stringify(body));
}

test('a new reading stores one row; an unchanged one stores none', () => {
  const ctx = setupTest();
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 } });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:05:00Z'))).toBe(false);
  expect(ctx.readRows()).toStrictEqual([{ at: '2026-10-16T01:00:00Z', account: 'active', five_hour: 18, seven_day: 62 }]);
  cache({ used: 63, windows: { fiveHour: 20, sevenDay: 63 } });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:10:00Z'))).toBe(true);
  expect(ctx.readRows()).toHaveLength(2);
});

test('a reading names its account when the cache does', () => {
  const ctx = setupTest();
  cache({ account: 'abcdef012345', windows: { fiveHour: 1, sevenDay: 2 } });
  sampleUsage(ctx.db);
  cache({ account: 'not a hash', windows: { fiveHour: 5, sevenDay: 6 } });
  sampleUsage(ctx.db, new Date('2026-10-16T07:01:00Z'));
  expect(ctx.readRows().map((row) => row.account)).toStrictEqual(['abcdef012345', 'active']);
});

test('a missing, unreadable or empty cache stores nothing and says nothing', () => {
  const ctx = setupTest();
  expect(sampleUsage(ctx.db)).toBe(false);
  cache('{not json', true);
  expect(sampleUsage(ctx.db)).toBe(false);
  cache({ error: 'Claude usage endpoint failed' });
  expect(sampleUsage(ctx.db)).toBe(false);
  cache({ windows: { fiveHour: 'lots', sevenDay: -4 } });
  expect(sampleUsage(ctx.db)).toBe(false);
  expect(ctx.readRows()).toStrictEqual([]);
  rmSync(getUsageCache());
});

test('XDG_CACHE_HOME moves the cache file', () => {
  const ctx = setupTest();
  process.env['XDG_CACHE_HOME'] = `${ctx.directory}/xdg`;
  expect(getUsageCache()).toBe(`${ctx.directory}/xdg/z-capacity/claude-usage.json`);
});

test('switching account A to B and back to A with unchanged figures stores A again, and cost reports A', () => {
  const ctx = setupTest();
  const w = { fiveHour: 10, sevenDay: 40 };
  cache({ account: 'aaaaaaaaaaaa', windows: w });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  cache({ account: 'bbbbbbbbbbbb', windows: { fiveHour: 50, sevenDay: 90 } });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T02:00:00Z'))).toBe(true);
  cache({ account: 'aaaaaaaaaaaa', windows: w });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T03:00:00Z'))).toBe(true);
  expect(sampleUsage(ctx.db, new Date('2026-10-16T04:00:00Z'))).toBe(false);
  expect(ctx.readRows()).toHaveLength(3);
  expect(measure(ctx.db, new Date('2026-10-15T13:00:00Z'), new Date('2026-10-16T13:00:00Z'), new Date('2026-10-16T07:00:00Z')).cost).toMatchObject({ value: 40, denominator: 2 });
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
  const ctx = setupTest();
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 } }, '2026-10-16T01:00:00Z');
  accountFile(B, { account: B, windows: { fiveHour: 50, sevenDay: 90 } }, '2026-10-16T02:00:00Z');
  expect(sampleUsage(ctx.db, new Date('2026-10-16T05:00:00Z'))).toBe(true);
  expect(ctx.readRows()).toStrictEqual([
    { at: '2026-10-16T01:00:00Z', account: A, five_hour: 10, seven_day: 40 },
    { at: '2026-10-16T02:00:00Z', account: B, five_hour: 50, seven_day: 90 },
  ]);
  expect(sampleUsage(ctx.db, new Date('2026-10-16T05:05:00Z'))).toBe(false);
  expect(ctx.readRows()).toHaveLength(2);
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 } }, '2026-10-16T03:00:00Z');
  expect(sampleUsage(ctx.db, new Date('2026-10-16T05:10:00Z'))).toBe(true);
  expect(ctx.readRows()).toHaveLength(3);
});

test('a file with a bad name, a bad account, a mismatched account or no figures is skipped without a word', () => {
  const ctx = setupTest();
  accountFile(A, { account: B, windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('ABCDEFABCDEF', { account: 'ABCDEFABCDEF', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('geoff@example.com', { account: 'geoff@example.com', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('short', { account: 'short', windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile(B, { windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  accountFile('cccccccccccc', '{not json', '2026-10-16T01:00:00Z');
  accountFile('dddddddddddd', { account: 'dddddddddddd', windows: { fiveHour: 'lots' } }, '2026-10-16T01:00:00Z');
  expect(sampleUsage(ctx.db, new Date('2026-10-16T05:00:00Z'))).toBe(false);
  expect(ctx.readRows()).toStrictEqual([]);
});

test('with no folder, or an empty one, the old single file is read as before', () => {
  const ctx = setupTest();
  cache({ account: A, windows: { fiveHour: 18, sevenDay: 62 } });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:00:00Z'))).toBe(true);
  mkdirSync(getUsageDir(), { recursive: true });
  cache({ windows: { fiveHour: 20, sevenDay: 63 } });
  expect(sampleUsage(ctx.db, new Date('2026-10-16T02:00:00Z'))).toBe(true);
  expect(ctx.readRows()).toStrictEqual([
    { at: '2026-10-16T01:00:00Z', account: A, five_hour: 18, seven_day: 62 },
    { at: '2026-10-16T02:00:00Z', account: 'active', five_hour: 20, seven_day: 63 },
  ]);
});

test('once the folder holds account files, the old single file is left alone', () => {
  const ctx = setupTest();
  cache({ account: A, windows: { fiveHour: 99, sevenDay: 99 } });
  accountFile(B, { account: B, windows: { fiveHour: 1, sevenDay: 2 } }, '2026-10-16T01:00:00Z');
  sampleUsage(ctx.db, new Date('2026-10-16T05:00:00Z'));
  expect(ctx.readRows().map((row) => row.account)).toStrictEqual([B]);
});

test('it lets a failed insert of an account reading reach the caller', () => {
  const ctx = setupTest();
  mkdirSync(getUsageDir(), { recursive: true });
  writeFileSync(`${getUsageDir()}/abcdef012345.json`, JSON.stringify({ account: 'abcdef012345', windows: { fiveHour: 1, sevenDay: 2 } }));
  ctx.db.run(`CREATE TRIGGER refuse_usage BEFORE INSERT ON usage_samples BEGIN SELECT RAISE(ABORT, 'invented full database'); END`);

  expect(() => sampleUsage(ctx.db)).toThrow('invented full database');
});

test("an account file's reset times are stored per window, and a reset that is not a time is left out", () => {
  const ctx = setupTest();
  accountFile(A, { account: A, windows: { fiveHour: 10, sevenDay: 40 }, resets: { fiveHour: '2026-10-16T05:00:00.123456+00:00', sevenDay: 'October 20, 2026 08:00:00 GMT' } }, '2026-10-16T01:00:00Z');
  sampleUsage(ctx.db, new Date('2026-10-16T05:00:00Z'));
  expect(ctx.db.query('SELECT account, five_hour_resets_at, seven_day_resets_at FROM usage_samples').all()).toStrictEqual([{ account: A, five_hour_resets_at: '2026-10-16T05:00:00Z', seven_day_resets_at: null }]);
});

test('the single cache file stores its reset times too', () => {
  const ctx = setupTest();
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 }, resets: { fiveHour: '2026-10-16T04:00:00Z', sevenDay: '2026-10-20T08:00:00Z' } });
  sampleUsage(ctx.db, new Date('2026-10-16T01:00:00Z'));
  expect(ctx.db.query('SELECT five_hour_resets_at, seven_day_resets_at FROM usage_samples').all()).toStrictEqual([{ five_hour_resets_at: '2026-10-16T04:00:00Z', seven_day_resets_at: '2026-10-20T08:00:00Z' }]);
});

test('the single cache file stores a new row when only its reset times change', () => {
  const ctx = setupTest();
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 } });
  sampleUsage(ctx.db, new Date('2026-10-16T01:00:00Z'));
  cache({ used: 62, windows: { fiveHour: 18, sevenDay: 62 }, resets: { fiveHour: '2026-10-16T04:00:00Z', sevenDay: '2026-10-20T08:00:00Z' } });

  expect(sampleUsage(ctx.db, new Date('2026-10-16T01:05:00Z'))).toBe(true);
  expect(ctx.db.query('SELECT at, five_hour_resets_at, seven_day_resets_at FROM usage_samples ORDER BY at').all()).toStrictEqual([
    { at: '2026-10-16T01:00:00Z', five_hour_resets_at: null, seven_day_resets_at: null },
    { at: '2026-10-16T01:05:00Z', five_hour_resets_at: '2026-10-16T04:00:00Z', seven_day_resets_at: '2026-10-20T08:00:00Z' },
  ]);
});
