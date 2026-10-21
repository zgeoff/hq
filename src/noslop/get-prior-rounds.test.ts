import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { getPriorRounds } from './get-prior-rounds.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return { base, db };
}

test('it finds no earlier round on a PR nobody has reviewed', () => {
  const ctx = setupTest();

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md'))).toStrictEqual({ codexBefore: false, noslopBefore: false });
});

test('it finds a Codex round from its review file', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md'))).toStrictEqual({ codexBefore: true, noslopBefore: false });
});

test('it finds a Codex round from a run PR with a review round', () => {
  const ctx = setupTest();
  ctx.db.exec('PRAGMA foreign_keys = OFF');
  ctx.db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-1', 'open', 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z')").run();

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md'))).toStrictEqual({ codexBefore: true, noslopBefore: false });
  expect(getPriorRounds(ctx.db, 'widgets', 8, join(ctx.base, 'widgets8-review.md'))).toStrictEqual({ codexBefore: false, noslopBefore: false });
});

test('it does not count a run PR that has had no review round as a Codex round', () => {
  const ctx = setupTest();
  ctx.db.exec('PRAGMA foreign_keys = OFF');
  ctx.db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-1', 'open', 0, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z')").run();

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md')).codexBefore).toBe(false);
});

test('it does not count a check-only PR as having had a noslop review', () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('widgets', 7, 'check', '2026-10-18T00:00:00Z', '2026-10-18T00:00:01Z', 1000, 1, 'abc1234')").run();

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md')).noslopBefore).toBe(false);
});

test('it finds a noslop round from a stored review of the PR', () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('widgets', 7, 'review', '2026-10-18T00:00:00Z', '2026-10-18T00:00:01Z', 1000, 0, 'abc1234')").run();

  expect(getPriorRounds(ctx.db, 'widgets', 7, join(ctx.base, 'widgets7-review.md')).noslopBefore).toBe(true);
  expect(getPriorRounds(ctx.db, 'widgets', 8, join(ctx.base, 'widgets8-review.md')).noslopBefore).toBe(false);
});
