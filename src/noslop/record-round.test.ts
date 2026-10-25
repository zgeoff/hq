import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../db/migrate.ts';
import { MIGRATIONS } from '../db/migrations.ts';
import { openDb } from '../db/open-db.ts';
import { SCHEMA_VERSION } from '../db/schema-version.ts';
import { recordRound } from './record-round.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return { base, db };
}

test('it creates the noslop rounds table on a fresh database', () => {
  const ctx = setupTest();

  expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(25);
  expect(ctx.db.query('PRAGMA user_version').get()).toStrictEqual({ user_version: SCHEMA_VERSION });
  expect(ctx.db.query("SELECT name FROM sqlite_master WHERE name IN ('noslop_rounds', 'noslop_rounds_pr') ORDER BY name").all()).toStrictEqual([{ name: 'noslop_rounds' }, { name: 'noslop_rounds_pr' }]);
});

test('it upgrades a v23 database to v24 after taking a backup, keeping its rows', () => {
  const ctx = setupTest(),
    path = join(ctx.base, 'old.db'),
    stored = new Database(path, { create: true, strict: true });
  onTestFinished(() => stored.close());
  migrate(stored, path, false, MIGRATIONS.slice(0, 23));
  stored.query("INSERT INTO meta (key, value) VALUES ('keep', 'me')").run();

  expect(migrate(stored, path, true, MIGRATIONS.slice(0, 24))).toContain('.bak-v23-');

  expect(stored.query('PRAGMA user_version').get()).toStrictEqual({ user_version: 24 });
  expect(stored.query("SELECT value FROM meta WHERE key = 'keep'").get()).toStrictEqual({ value: 'me' });
  expect(stored.query('SELECT COUNT(*) AS n FROM noslop_rounds').get()).toStrictEqual({ n: 0 });
});

test('it upgrades a v24 database to v25 after taking a backup, leaving full NULL on the rounds it had', () => {
  const ctx = setupTest(),
    path = join(ctx.base, 'old.db'),
    stored = new Database(path, { create: true, strict: true });
  onTestFinished(() => stored.close());
  migrate(stored, path, false, MIGRATIONS.slice(0, 24));
  stored.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'x')").run();

  expect(migrate(stored, path, true, MIGRATIONS.slice(0, 25))).toContain('.bak-v24-');

  expect(stored.query('PRAGMA user_version').get()).toStrictEqual({ user_version: 25 });
  expect(stored.query('SELECT repo, full FROM noslop_rounds').get()).toStrictEqual({ repo: 'widgets', full: null });
});

test('it refuses a round with a kind or an ok flag the table does not allow', () => {
  const ctx = setupTest();

  expect(() => ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('w', 1, 'other', 'a', 'b', 1, 1, 'x')").run()).toThrow();
  expect(() => ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('w', 1, 'review', 'a', 'b', 1, 2, 'x')").run()).toThrow();
  expect(() => ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha, full) VALUES ('w', 1, 'review', 'a', 'b', 1, 1, 'x', 2)").run()).toThrow();
});

test('it upgrades a v32 database to v33 after taking a backup, leaving special and redesign NULL on the rounds it had', () => {
  const ctx = setupTest(),
    path = join(ctx.base, 'old.db'),
    stored = new Database(path, { create: true, strict: true });
  onTestFinished(() => stored.close());
  migrate(stored, path, false, MIGRATIONS.slice(0, 32));
  stored.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'x')").run();

  expect(migrate(stored, path, true, MIGRATIONS.slice(0, 33))).toContain('.bak-v32-');

  expect(stored.query('PRAGMA user_version').get()).toStrictEqual({ user_version: 33 });
  expect(stored.query('SELECT repo, special, redesign FROM noslop_rounds').get()).toStrictEqual({ repo: 'widgets', special: null, redesign: null });
});

test("it stores a review's patch-id and whether it was a base move, and stores none for a check", () => {
  const ctx = setupTest();
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the property is RoundRow's own
  const review = { repo: 'widgets', pr: 7, kind: 'review' as const, startedAt: '2026-10-14T01:00:00Z', endedAt: '2026-10-14T01:05:00Z', ms: 300_000, ok: true, head: 'b2b2b2b', base: 'a1a1a1a', depth: 'standard', findings: [], failedCalls: 0, conclusion: null, open: [], error: null, sha: 'c3c3c3c' };
  recordRound(ctx.db, { ...review, patchId: 'd4d4d4d4', baseMove: true, confirm: true });
  recordRound(ctx.db, { ...review, kind: 'check' });

  expect(ctx.db.query('SELECT kind, patch_id, base_move, confirm FROM noslop_rounds ORDER BY id').all()).toStrictEqual([
    { kind: 'review', patch_id: 'd4d4d4d4', base_move: 1, confirm: 1 },
    { kind: 'check', patch_id: null, base_move: 0, confirm: 0 },
  ]);
});
