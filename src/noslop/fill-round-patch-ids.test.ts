import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import { realRunner } from '../runner/real-runner.ts';
import { buildNoslopReport } from './build-noslop-report.ts';
import { fillRoundPatchIDs } from './fill-round-patch-ids.ts';

// A database, and an empty git repo for widgets, with git and commit helpers and a helper that
// stores a pre-v45 ok review with no patch-id.
async function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-fill-patch-'));
  const directory = join(base, 'projects', 'widgets');
  const db = openDb(join(base, 'hq.db'));
  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  mkdirSync(directory, { recursive: true });
  const git = async (...args: string[]): Promise<string> => {
    const result = await realRunner(['git', '-c', 'user.name=Kettle', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: directory });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  const commit = async (path: string, text: string, message: string): Promise<string> => {
    writeFileSync(join(directory, path), text);
    await git('add', '-A');
    await git('commit', '-q', '-m', message);
    return await git('rev-parse', 'HEAD');
  };
  await git('init', '-q', '-b', 'main');
  return {
    db,
    directory,
    git,
    commit,
    addReview: (startedAt: string, head: string, baseSha: string) =>
      db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, findings, failed_calls, open, sha) VALUES ('widgets', 7, 'review', ?, ?, 1, 1, ?, ?, '[]', 0, '[]', 'x')").run(startedAt, startedAt, head, baseSha),
  };
}

test('it gives pre-v45 reviews the patch-id of their PR diff, so the report finds the rebase onto a moved base', async () => {
  const ctx = await setupTest();
  const firstBase = await ctx.commit('kettle.txt', 'boil\n', 'start');
  await ctx.git('checkout', '-q', '-b', 'pour');
  const first = await ctx.commit('pour.txt', 'pour\n', 'pour');
  await ctx.git('checkout', '-q', 'main');
  const movedBase = await ctx.commit('lid.txt', 'lid\n', 'main moves on');
  await ctx.git('checkout', '-q', 'pour');
  await ctx.git('rebase', '-q', 'main');
  const rebased = await ctx.git('rev-parse', 'HEAD');
  ctx.addReview('2026-10-18T01:00:00Z', first, firstBase);
  ctx.addReview('2026-10-18T02:00:00Z', rebased, movedBase);
  ctx.addReview('2026-10-18T03:00:00Z', 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1', movedBase);

  const filled = await fillRoundPatchIDs({ run: realRunner, db: ctx.db, checkout: () => Promise.resolve(ctx.directory) });
  const stored = ctx.db.query('SELECT patch_id FROM noslop_rounds ORDER BY id').values().flat();
  const refilled = await fillRoundPatchIDs({ run: realRunner, db: ctx.db, checkout: () => Promise.resolve(ctx.directory) });

  expect(filled).toBe(2);
  expect(stored).toStrictEqual([expect.stringMatching(/^[0-9a-f]{40}$/u), stored[0], '']);
  expect(buildNoslopReport(ctx.db)[0]).toMatchObject({ reviewsOk: 3, extraRounds: 1, baseMove: 1 });
  expect(refilled).toBe(0);
});

test('it refuses a --since that is not a time before it reads any round', async () => {
  const ctx = await setupTest();

  await expect(fillRoundPatchIDs({ run: realRunner, db: ctx.db, since: 'yesterday-ish', checkout: () => Promise.resolve(ctx.directory) })).rejects.toThrow("--since must be an ISO time, got 'yesterday-ish'");
});

test('it leaves the patch-id unread for a repo hq has no checkout of, so a later report tries again', async () => {
  const ctx = await setupTest();
  const head = await ctx.commit('kettle.txt', 'boil\n', 'start');
  ctx.addReview('2026-10-18T01:00:00Z', head, head);

  const filled = await fillRoundPatchIDs({ run: realRunner, db: ctx.db, checkout: () => Promise.reject(new Error('invented: no clone of widgets')) });

  expect(filled).toBe(0);
  expect(ctx.db.query('SELECT patch_id FROM noslop_rounds').all()).toStrictEqual([{ patch_id: null }]);
});
