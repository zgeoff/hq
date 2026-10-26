import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_REVIEW_JSON, FAKE_SECRETS, FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import { resetIssueFlags } from './reset-issue-flags.ts';
import { runNoslopReview } from './run-noslop-review.ts';
import type { NoslopReviewContext } from './run-noslop-review.ts';

function readKettleIssue(): ReturnType<LinearCall> {
  return Promise.resolve({ issue: { identifier: 'GEO-12', title: 'Mend the kettle', description: 'It never boils.' } });
}

// A repo lock that lets the worktree be made, then times out on the cleanup.
function buildLockThatTimesOut(): NoslopReviewContext['lock'] {
  let calls = 0;
  return (fn) => {
    calls += 1;
    if (calls > 1) {
      return Promise.reject(new Error('the lock is held'));
    }
    return fn();
  };
}

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-run-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
    resetIssueFlags();
  });
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_ITEM', 'invented-item-id'));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_VAULT', 'invented-vault-id'));

  return {
    base,
    db,
    reviewContext: (run: Runner): NoslopReviewContext => ({
      run,
      db,
      slug: 'zgeoff/widgets',
      repo: 'widgets',
      pr: 7,
      dir: join(base, 'widgets'),
      scratch: base,
      clone: join(base, 'noslop'),
      sha: 'abc1234abc1234abc1234abc1234abc1234abc12',
      store: join(base, 'store.sqlite'),
      lock: (fn) => fn(),
      timeoutMs: 900_000,
    }),
  };
}

test('it asks noslop for a full review only when told to', async () => {
  const ctx = setupTest(),
    full = buildFakeRunner(),
    partial = buildFakeRunner();

  await runNoslopReview(ctx.reviewContext(partial.run));
  await runNoslopReview({ ...ctx.reviewContext(full.run), full: true });

  expect(partial.of('bun')[0]?.cmd).not.toContain('--full');
  expect(full.of('bun')[0]?.cmd.slice(-2)).toStrictEqual(['--json', '--full']);
  expect(ctx.db.query('SELECT full FROM noslop_rounds ORDER BY id').all()).toStrictEqual([{ full: 0 }, { full: 1 }]);
});

test('it hands noslop the linked Linear issue in a file, then removes the file', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prBody: 'Fixes GEO-12', noslopHelp: { code: 0, stdout: '  --issue-file <path>\n', stderr: '' } }),
    file = `${ctx.base}/widgets+7-issue-${process.pid}.md`,
    runAndRead: Runner = async (cmd, opts) => {
      const at = cmd.indexOf('--issue-file');
      if (at > 0) {
        seen.push(readFileSync(cmd[at + 1] ?? '', 'utf8'));
      }
      return await fake.run(cmd, opts);
    },
    seen: string[] = [];

  await expect(runNoslopReview({ ...ctx.reviewContext(runAndRead), linear: readKettleIssue })).resolves.toMatchObject({ issue: { issue: 'GEO-12', attached: true, why: 'attached' } });

  expect(fake.of('bun').at(-1)?.cmd.slice(-2)).toStrictEqual(['--issue-file', file]);
  expect(seen).toStrictEqual(['# GEO-12: Mend the kettle\n\nIt never boils.\n']);
  expect(existsSync(file)).toBe(false);
});

test('it removes the issue file even when the worktree cleanup cannot take the lock', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ prBody: 'Fixes GEO-12', noslopHelp: { code: 0, stdout: '  --issue-file <path>\n', stderr: '' } }),
    file = `${ctx.base}/widgets+7-issue-${process.pid}.md`,
    review = { ...ctx.reviewContext(fake.run), linear: readKettleIssue, lock: buildLockThatTimesOut() };

  await runNoslopReview(review);

  expect(fake.of('bun').at(-1)?.cmd).toContain('--issue-file');
  expect(existsSync(file)).toBe(false);
});

test('it records a review that ran and logs the cleanup error when the worktree cleanup cannot take the lock', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();

  await runNoslopReview({ ...ctx.reviewContext(fake.run), lock: buildLockThatTimesOut() });

  expect(ctx.db.query("SELECT kind, ok FROM noslop_rounds WHERE repo = 'widgets' AND pr = 7").all()).toStrictEqual([{ kind: 'review', ok: 1 }]);
  expect(ctx.db.query("SELECT json_extract(data, '$.error') AS error FROM events WHERE action = 'cleanup_failed'").all()).toStrictEqual([{ error: 'the lock is held' }]);
});

test('it reviews without an issue file when the PR links none', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    result = await runNoslopReview({ ...ctx.reviewContext(fake.run), linear: readKettleIssue });

  expect(fake.of('bun').at(-1)?.cmd).not.toContain('--issue-file');
  expect(result.issue).toStrictEqual({ issue: null, attached: false, why: 'the PR body links no GEO issue' });
});

test('it records the review with its findings and returns them', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    result = await runNoslopReview(ctx.reviewContext(fake.run));

  expect(result.findings).toStrictEqual([{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }]);
  expect(ctx.db.query('SELECT repo, pr, kind, ok, depth, failed_calls, error, sha, findings FROM noslop_rounds').get()).toStrictEqual({
    repo: 'widgets',
    pr: 7,
    kind: 'review',
    ok: 1,
    depth: 'standard',
    failed_calls: 0,
    error: null,
    sha: 'abc1234abc1234abc1234abc1234abc1234abc12',
    findings: JSON.stringify([{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: null, rule: null, path: null, startLine: null, endLine: null, writtenByChange: null, late: null }]),
  });
});

test('it runs noslop from the pinned clone with its own bunfig, in the worktree of the base', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopReview(ctx.reviewContext(fake.run));

  expect(fake.of('bun')[0]?.cmd).toStrictEqual([
    'bun',
    `--config=${ctx.base}/noslop/bunfig.toml`,
    `${ctx.base}/noslop/apps/cli/src/cli.ts`,
    'review',
    '--pr',
    '7',
    '--repo',
    'zgeoff/widgets',
    '--report',
    'sqlite,github',
    '--json',
  ]);
  expect(fake.of('bun')[0]?.opts?.cwd).toBe(`${ctx.base}/widgets+7-noslop-${process.pid}`);
  expect(fake.of('bun')[0]?.opts?.timeoutMs).toBe(900_000);
});

test('it fetches the PR head and removes the worktree after the review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopReview(ctx.reviewContext(fake.run));

  expect(fake.lines().filter((l) => l.startsWith('git fetch'))).toStrictEqual(['git fetch -q origin', 'git fetch -q origin pull/7/head']);
  expect(fake.lines().findIndex((l) => l.startsWith('git worktree add -q --detach'))).toBeLessThan(fake.lines().findIndex((l) => l.startsWith('bun ')));
  expect(fake.lines().findIndex((l) => l.startsWith('bun '))).toBeLessThan(fake.lines().findIndex((l) => l.startsWith('git worktree remove --force')));
  expect(fake.lines().find((line) => line.startsWith('git worktree add'))).toBe(`git worktree add -q --detach ${ctx.base}/widgets+7-noslop-${process.pid} origin/main`);
});

test('it gives the credentials to the noslop child only, and the 1Password token to the op children only', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopReview(ctx.reviewContext(fake.run));

  expect(fake.of('bun')[0]?.opts?.env?.['NOSLOP_GITHUB_APP_ID']).toBe(FAKE_SECRETS['app-id']);
  expect(fake.of('bun')[0]?.opts?.env?.['NOSLOP_GITHUB_APP_INSTALLATION_ID']).toBe(FAKE_SECRETS['installation-id']);
  expect(fake.of('bun')[0]?.opts?.env?.['NOSLOP_GITHUB_APP_PRIVATE_KEY']).toBe(FAKE_SECRETS['private-key']);
  expect(fake.of('bun')[0]?.opts?.env?.['OP_SERVICE_ACCOUNT_TOKEN']).toBeUndefined();
  expect(fake.of('op').map((c) => c.cmd.join(' '))).toStrictEqual(['op item get invented-item-id --vault invented-vault-id --fields label=app-id,label=installation-id,label=private-key --reveal --format json']);
  expect(fake.of('op').map((c) => c.opts?.env?.['OP_SERVICE_ACCOUNT_TOKEN'])).toStrictEqual([FAKE_TOKEN]);
  expect(fake.of('git').some((c) => c.opts?.env?.['NOSLOP_GITHUB_APP_ID'] !== undefined)).toBe(false);
  expect(fake.of('gh').some((c) => c.opts?.env?.['NOSLOP_GITHUB_APP_ID'] !== undefined)).toBe(false);
});

test('it keeps every credential out of the returned data, the event log and the stored rounds', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    result = await runNoslopReview(ctx.reviewContext(fake.run)),
    stored = JSON.stringify([ctx.db.query('SELECT * FROM events').all(), ctx.db.query('SELECT * FROM noslop_rounds').all(), result]);

  for (const secret of [...Object.values(FAKE_SECRETS), FAKE_TOKEN]) {
    expect(stored).not.toContain(secret);
  }
  await expect(Bun.file(result.reviewFile).text()).resolves.toBe(FAKE_REVIEW_JSON);
});

test.each([
  ['the run times out', { code: 124, stdout: '', stderr: 'bun timed out after 900 s' }, 'timed out after 15 min'],
  ['noslop exits 1', { code: 1, stdout: '', stderr: 'could not reach GitHub' }, 'exit 1: could not reach GitHub'],
  ['the output is not JSON', { code: 0, stdout: 'Review done.', stderr: '' }, 'output is not JSON'],
  ['the output is version 3', { code: 0, stdout: '{"version":3,"findings":[]}', stderr: '' }, 'output version 3, hq reads versions 4, 5, 6 and 7'],
  ['the output is version 8', { code: 0, stdout: '{"version":8,"findings":[]}', stderr: '' }, 'output version 8, hq reads versions 4, 5, 6 and 7'],
  ['a version 6 output has no notReviewed list', { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), version: 6, dropped: [] }), stderr: '' }, 'output version 6 has no notReviewed list'],
  ['a noslop call failed', { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), failedCalls: [{ lens: 'security' }] }), stderr: '' }, '1 noslop call(s) failed'],
])('it throws noslop_failed and records no review when %s', async (_name, noslopReview, why) => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({
    code: 'noslop_failed',
    message: expect.stringContaining(`noslop gave no review (${why}): this is no review, not a pass. Output: ${ctx.base}/widgets+7-noslop.json`),
  });

  expect(ctx.db.query('SELECT ok, error, kind FROM noslop_rounds').all()).toStrictEqual([{ ok: 0, error: why, kind: 'review' }]);
  expect(fake.of('codex')).toStrictEqual([]);
  expect(fake.lines().some((l) => l.startsWith('git worktree remove --force'))).toBe(true);
});

test('it reads a version 5 review, which adds the dropped findings', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), version: 5, dropped: [{ lens: 'style', reason: 'no quote', title: 'Lid is loose' }] }), stderr: '' } }),
    result = await runNoslopReview(ctx.reviewContext(fake.run));

  expect(result.findings).toStrictEqual([{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }]);
  expect(ctx.db.query('SELECT ok, error FROM noslop_rounds').get()).toStrictEqual({ ok: 1, error: null });
});

test('it reads a version 6 review, which lists the files no call read, and keeps them on the result', async () => {
  const ctx = setupTest(),
    left = [
      { path: 'data/kettle-readings.json', reason: 'data' },
      { path: 'src/teapot-lid.ts', reason: 'too-large' },
    ],
    noslop = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), version: 6, dropped: [], notReviewed: left }), stderr: '' } }).run,
    result = await runNoslopReview(ctx.reviewContext(noslop));

  expect([result.findings.map((f) => f.id), result.notReviewed]).toStrictEqual([['00112233445566aa'], left]);
  expect(ctx.db.query('SELECT ok, error FROM noslop_rounds').get()).toStrictEqual({ ok: 1, error: null });
});

test('a version 4 or 5 review has no files left out', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), version: 5, dropped: [] }), stderr: '' } }),
    result = await runNoslopReview(ctx.reviewContext(fake.run));

  expect(result.notReviewed).toStrictEqual([]);
});

test('it counts the failed calls in the stored round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), failedCalls: [1, 2] }), stderr: '' } });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(ctx.db.query('SELECT failed_calls FROM noslop_rounds').get()).toStrictEqual({ failed_calls: 2 });
});

test('it records a review noslop stored but could not post to GitHub as a round, with its findings and the failed post', async () => {
  const ctx = setupTest();
  const store = new Database(join(ctx.base, 'store.sqlite'), { create: true });
  const fake = buildFakeRunner({ noslopReview: { code: 1, stdout: FAKE_REVIEW_JSON, stderr: 'the github reporter failed: HTTP 500' } });
  store.run('CREATE TABLE reviews (review_id TEXT PRIMARY KEY, repo TEXT NOT NULL, pull_request INTEGER, head TEXT NOT NULL)');
  store.query('INSERT INTO reviews (review_id, repo, pull_request, head) VALUES (?, ?, ?, ?)').run('r1', 'zgeoff/widgets', 7, 'feat');
  store.close();

  const result = await runNoslopReview(ctx.reviewContext(fake.run));

  expect(result.postFailed).toBe('exit 1: the github reporter failed: HTTP 500');
  expect(result.findings).toStrictEqual([{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }]);
  expect(ctx.db.query('SELECT kind, ok, head, error, findings FROM noslop_rounds').all()).toStrictEqual([
    {
      kind: 'review',
      ok: 1,
      head: 'feat',
      error: 'stored, but not posted to GitHub: exit 1: the github reporter failed: HTTP 500',
      findings: JSON.stringify([{ id: '00112233445566aa', lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: null, rule: null, path: null, startLine: null, endLine: null, writtenByChange: null, late: null }]),
    },
  ]);
});

test('it records no review when noslop exits 1 before its store holds the review it printed', async () => {
  const ctx = setupTest();
  const store = new Database(join(ctx.base, 'store.sqlite'), { create: true });
  const fake = buildFakeRunner({ noslopReview: { code: 1, stdout: FAKE_REVIEW_JSON, stderr: 'the sqlite reporter failed: disk full' } });
  store.run('CREATE TABLE reviews (review_id TEXT PRIMARY KEY, repo TEXT NOT NULL, pull_request INTEGER, head TEXT NOT NULL)');
  store.query('INSERT INTO reviews (review_id, repo, pull_request, head) VALUES (?, ?, ?, ?)').run('r0', 'zgeoff/widgets', 7, 'feat');
  store.close();

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(ctx.db.query('SELECT ok, error FROM noslop_rounds').all()).toStrictEqual([{ ok: 0, error: 'exit 1: the sqlite reporter failed: disk full' }]);
});

test('it records no review when noslop exits 1 and has no store yet', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ noslopReview: { code: 1, stdout: FAKE_REVIEW_JSON, stderr: 'the sqlite reporter failed: no data folder' } });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(ctx.db.query('SELECT ok, error FROM noslop_rounds').all()).toStrictEqual([{ ok: 0, error: 'exit 1: the sqlite reporter failed: no data folder' }]);
});

test('it records no review when noslop exits 1 with output that is no review, even when its store holds one', async () => {
  const ctx = setupTest();
  const store = new Database(join(ctx.base, 'store.sqlite'), { create: true });
  const fake = buildFakeRunner({ noslopReview: { code: 1, stdout: 'Review done.', stderr: 'the github reporter failed: HTTP 500' } });
  store.run('CREATE TABLE reviews (review_id TEXT PRIMARY KEY, repo TEXT NOT NULL, pull_request INTEGER, head TEXT NOT NULL)');
  store.query('INSERT INTO reviews (review_id, repo, pull_request, head) VALUES (?, ?, ?, ?)').run('r1', 'zgeoff/widgets', 7, 'feat');
  store.close();

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(ctx.db.query('SELECT ok, error FROM noslop_rounds').all()).toStrictEqual([{ ok: 0, error: 'exit 1: the github reporter failed: HTTP 500' }]);
});

test('it blanks a credential that noslop echoes in its error output', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 1, stdout: '', stderr: `bad key ${FAKE_SECRETS['private-key']} and app ${FAKE_SECRETS['app-id']}` } });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({
    message: expect.stringMatching(/^(?!.*(?:badger-secret-key|app-4711)).*\[redacted\]/su),
  });

  expect(JSON.stringify(ctx.db.query('SELECT error FROM noslop_rounds').all())).not.toContain('badger-secret-key');
});

test('it names the empty field when 1Password gives an empty installation id', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ secrets: { ...FAKE_SECRETS, 'installation-id': '' } });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({
    code: 'bad_config',
    message: "noslop's installation-id in 1Password is empty",
  });

  expect(fake.of('bun')).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS n FROM noslop_rounds').get()).toStrictEqual({ n: 0 });
});

test('a review records its one 1Password read for the weekly audit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  await runNoslopReview(ctx.reviewContext(fake.run));

  expect(ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'noslop', data: '{"consumer":"noslop","requests":1}' }]);
});

test('a review whose 1Password read is refused still records the read', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ opAnswer: { code: 1, stdout: '', stderr: 'vault not found' } });

  await expect(runNoslopReview(ctx.reviewContext(fake.run))).rejects.toMatchObject({ code: 'bad_config' });
  expect(ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'noslop', data: '{"consumer":"noslop","requests":1}' }]);
});

function buildAnchoredReview(id: string, head: string): string {
  return JSON.stringify({ version: 6, head, base: 'main', depth: 'standard', findings: [{ id, lens: 'correctness', severity: 'high', title: 'Kettle never boils', criterion: 'boil-check', anchor: { path: 'src/kettle.ts', startLine: 3, endLine: 4 }, writtenByChange: true }], failedCalls: [], notReviewed: [] });
}

function makeGitlessRunner(run: Runner): Runner {
  return (cmd, opts) => (cmd[1] === 'cat-file' ? Promise.reject(new Error('git is gone')) : run(cmd, opts));
}

function readLateFlags(db: Database): (boolean | null | undefined)[] {
  const rows = db.query('SELECT findings FROM noslop_rounds ORDER BY id').all() as { findings: string }[];
  return rows.map((r) => (JSON.parse(r.findings) as { late: boolean | null }[])[0]?.late);
}

test('it records late on a new finding of a later review and leaves it null on the first', async () => {
  const ctx = setupTest(),
    first = buildFakeRunner({ noslopReview: { code: 0, stdout: buildAnchoredReview('aaaa', 'h1'), stderr: '' } }),
    second = buildFakeRunner({ noslopReview: { code: 0, stdout: buildAnchoredReview('bbbb', 'h2'), stderr: '' } });

  await runNoslopReview(ctx.reviewContext(first.run));
  await runNoslopReview(ctx.reviewContext(second.run));

  expect(readLateFlags(ctx.db)).toStrictEqual([null, true]);
  expect(second.lines()).toContain('git diff -U0 h1 h2 -- src/kettle.ts');
});

test('it still records the review when the late check cannot run git', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: buildAnchoredReview('bbbb', 'h2'), stderr: '' } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, findings, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'h1', '[]', 'x')").run();

  await runNoslopReview(ctx.reviewContext(makeGitlessRunner(fake.run)));

  expect(readLateFlags(ctx.db)).toStrictEqual([undefined, null]);
});
