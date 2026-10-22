import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/open-db.ts';
import type { Runner } from '../runner/types.ts';
import { collectLateFlags } from './collect-late-flags.ts';
import type { ReviewFinding } from './parse-review-run.ts';
import { recordRound } from './record-round.ts';
import type { RecordedFinding } from './record-round.ts';

interface GitAnswers {
  commit: { code: number; stderr: string };
  cat: { code: number; stderr: string };
  diff: { code: number; stdout: string };
}

function makeGitRunner(calls: string[][], answers: GitAnswers): Runner {
  return (cmd) => {
    calls.push(cmd);
    if (cmd[1] === 'cat-file' && cmd[3]?.endsWith('^{commit}')) {
      return Promise.resolve({ code: answers.commit.code, stdout: '', stderr: answers.commit.stderr });
    }
    if (cmd[1] === 'cat-file') {
      return Promise.resolve({ code: answers.cat.code, stdout: '', stderr: answers.cat.stderr });
    }
    return Promise.resolve({ code: answers.diff.code, stdout: answers.diff.stdout, stderr: '' });
  };
}

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-late-')),
    calls: string[][] = [],
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return {
    calls,
    addReview: (head: string, findings: RecordedFinding[]) =>
      recordRound(db, { repo: 'widgets', pr: 7, kind: 'review', startedAt: '2026-10-18T01:00:00Z', endedAt: '2026-10-18T01:01:00Z', ms: 1, ok: true, head, base: 'main', depth: null, findings, failedCalls: 0, conclusion: null, open: [], error: null, sha: 'abc1234' }),
    collect: async (answers: GitAnswers, findings: ReviewFinding[], head: string) => {
      const result = await collectLateFlags({ run: makeGitRunner(calls, answers), db, repo: 'widgets', pr: 7, dir: '/repo', head, findings });
      return Object.fromEntries(result);
    },
  };
}

const CAT_OK = { code: 0, stderr: '' },
  NEW = { id: 'bbbb', lens: 'correctness', severity: 'high', title: 'Kettle never boils', anchor: { path: 'src/kettle.ts', startLine: 10, endLine: 12 } },
  OLD = { id: 'aaaa', lens: 'style', severity: 'low', title: 'Lid is loose' };

test('it flags a new finding late when the first-to-latest diff leaves its lines alone', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '@@ -1,2 +1,3 @@\n+x\n@@ -30 +31 @@\n' } }, [OLD, NEW], 'h2')).resolves.toStrictEqual({ aaaa: null, bbbb: true });
  expect(ctx.calls).toStrictEqual([
    ['git', 'cat-file', '-e', 'h1^{commit}'],
    ['git', 'cat-file', '-e', 'h1:src/kettle.ts'],
    ['git', 'diff', '-U0', 'h1', 'h2', '--', 'src/kettle.ts'],
  ]);
});

test('it flags a new finding not late when a hunk overlaps its lines', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '@@ -9,0 +11,2 @@\n' } }, [NEW], 'h2')).resolves.toStrictEqual({ bbbb: false });
});

test('it treats a pure deletion at a line inside the anchor as touching it', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '@@ -11,3 +11,0 @@\n' } }, [NEW], 'h2')).resolves.toStrictEqual({ bbbb: false });
});

test('it flags a finding in a file that is new since the first head as not late', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: { code: 128, stderr: "fatal: path 'src/kettle.ts' does not exist in 'h1'" }, diff: { code: 0, stdout: '' } }, [NEW], 'h2')).resolves.toStrictEqual({ bbbb: false });
});

test('it leaves the flag null when git diff fails', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 128, stdout: '' } }, [NEW], 'h2')).resolves.toStrictEqual({ bbbb: null });
});

test('it leaves the flag null when the first head is not in the clone', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: { code: 128, stderr: 'fatal: Not a valid object name 1111111111111111111111111111111111111111^{commit}' }, cat: CAT_OK, diff: { code: 0, stdout: '' } }, [NEW], 'h2')).resolves.toStrictEqual({ bbbb: null });
  expect(ctx.calls).toHaveLength(1);
});

test('it leaves every flag null on the first ok review and runs no git', async () => {
  const ctx = setupTest();

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '' } }, [NEW], 'h1')).resolves.toStrictEqual({ bbbb: null });
  expect(ctx.calls).toStrictEqual([]);
});

test('it leaves a finding seen before and a finding without an anchor null', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '' } }, [{ ...OLD, anchor: { path: 'a.ts', startLine: 1, endLine: 1 } }, { id: 'cccc', lens: 'style', severity: 'low', title: 'No anchor' }], 'h2')).resolves.toStrictEqual({ aaaa: null, cccc: null });
  expect(ctx.calls).toStrictEqual([]);
});

test('it runs one commit check, one cat-file and one diff for findings that share a path', async () => {
  const ctx = setupTest();
  ctx.addReview('h1', [OLD]);

  await expect(ctx.collect({ commit: CAT_OK, cat: CAT_OK, diff: { code: 0, stdout: '' } }, [NEW, { ...NEW, id: 'dddd', anchor: { path: 'src/kettle.ts', startLine: 50, endLine: 51 } }], 'h2')).resolves.toStrictEqual({ bbbb: true, dddd: true });
  expect(ctx.calls).toHaveLength(3);
});
