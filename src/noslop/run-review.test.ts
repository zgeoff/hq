import { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_FULL_SHA, FAKE_REVIEW_JSON, FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { main } from '../cli.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { RunResult } from '../runner/types.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { runReview } from './run-review.ts';

const PINNED = '0123456789abcdef0123456789abcdef01234567';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-review-noslop-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));
  onTestFinished(overrideEnv('REVIEW_DIR', base));
  onTestFinished(overrideEnv('HQ_PROJECTS', join(base, 'projects')));
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));
  const dataHome = process.env['XDG_DATA_HOME'];
  process.env['XDG_DATA_HOME'] = join(base, 'data');
  onTestFinished(() => {
    if (dataHome === undefined) {
      delete process.env['XDG_DATA_HOME'];
    } else {
      process.env['XDG_DATA_HOME'] = dataHome;
    }
  });

  return {
    base,
    db,

    // Runs a shell script in the temp dir with no global or system git config, and gives its stdout.
    runShell: async (script: string) => {
      const result = await realRunner(['sh', '-c', script], { cwd: base, env: cleanEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Badger', GIT_AUTHOR_EMAIL: 'badger@example.test', GIT_COMMITTER_NAME: 'Badger', GIT_COMMITTER_EMAIL: 'badger@example.test' }) });
      return result.stdout.trim();
    },
    addReview: (findings: string, redesign: string | null, head: string | null = null) => db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, 'standard', 'none', ?, ?, 'x')").run(head, findings, redesign),
    addRound: (kind: 'review' | 'check', ok: number, depth: string | null, special: string | null) => db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, depth, special, sha) VALUES ('widgets', 7, ?, 'a', 'b', 1, ?, ?, ?, 'x')").run(kind, ok, depth, special),
    listWidgets: () => setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: PINNED })),
    listUnpinned: () => setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: null })),
  };
}

test('it reviews a repo off the noslop list with Codex, as before', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    result = await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  expect(result).toMatchObject({ codexCode: 0, head: 'feat', base: 'main' });
  expect(fake.of('codex').map((c) => c.cmd[1])).toStrictEqual(['review']);
  expect(fake.of('bun')).toStrictEqual([]);
  expect(fake.of('op')).toStrictEqual([]);
});

test('it reviews a listed repo with noslop, then reads its CI checks and open threads', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: true })).resolves.toMatchObject({
    engine: 'noslop',
    repo: 'widgets',
    pr: 7,
    head: 'feat',
    base: 'main',
    sha: PINNED,
    openThreads: 1,
    checks: [{ name: 'test', state: 'SUCCESS', bucket: 'pass' }],
  });

  expect(fake.of('codex')).toStrictEqual([]);
  expect(fake.lines().some((l) => l.includes('gh pr checks 7 -R zgeoff/widgets --watch'))).toBe(true);
  expect(fake.of('bun')[0]?.cmd[1]).toBe(`--config=${ctx.base}/repos/zgeoff/noslop-${PINNED}/bunfig.toml`);
});

test('it passes --full to a noslop review of a listed repo', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--full');
});

test('it refuses --full for a PR on Codex, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true })).rejects.toMatchObject({ code: 'bad_args' });

  expect(fake.of('codex')).toStrictEqual([]);
  expect(fake.of('bun')).toStrictEqual([]);
});

test('it finishes a PR that already had a Codex review file on Codex', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.listWidgets();
  mkdirSync(join(ctx.base, 'zgeoff/widgets'), { recursive: true });
  writeFileSync(join(ctx.base, 'zgeoff/widgets/7-review.md'), 'No findings.\n');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ codexCode: 0 });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it finishes a PR on Codex whose review file has the flat name from before review folders', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.listWidgets();
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ codexCode: 0 });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it finishes a PR that already had a Codex round in a run on Codex', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.db.exec('PRAGMA foreign_keys = OFF');
  ctx.db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-1', 'open', 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z')").run();

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  expect(fake.of('codex').length).toBeGreaterThan(0);
  expect(fake.of('bun')).toStrictEqual([]);
});

test('it keeps a PR on noslop once noslop has reviewed it, even with a Codex file beside it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, sha) VALUES ('widgets', 7, 'review', '2026-10-18T00:00:00Z', '2026-10-18T00:01:00Z', 60000, 1, 'abc1234')").run();
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop' });

  expect(fake.of('codex')).toStrictEqual([]);
});

test('it refuses a listed repo that has no pinned commit, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listUnpinned();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({
    code: 'bad_config',
    message: 'noslop is on for widgets but no commit is pinned: hq noslop pin <sha>',
  });

  expect(fake.calls).toStrictEqual([]);
});

test('it never falls back to Codex when noslop gives no review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 1, stdout: '', stderr: 'boom' } });
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(fake.of('codex')).toStrictEqual([]);
});

function createRunPR(db: ReturnType<typeof openDb>): void {
  db.query("INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-9702', 'Fit the kettle lid', 'local', 'working', '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')").run();
  db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-9702', 'open', 0, '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')").run();
}

test('it marks the PR on its run reviewed at the head the round read, with no session writing it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: FAKE_REVIEW_JSON.replace('"head":"feat"', `"head":"${FAKE_FULL_SHA}"`), stderr: '' } });
  ctx.listWidgets();
  createRunPR(ctx.db);

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  expect(ctx.db.query("SELECT r.head = p.reviewed_sha AS same, p.review_round, p.review_started_at IS NOT NULL AS started FROM run_prs p, noslop_rounds r WHERE p.ref = 'widgets#7' AND r.repo = 'widgets' AND r.pr = 7").get()).toStrictEqual({ same: 1, review_round: 1, started: 1 });
});

test('it marks the review started but not reviewed when noslop gives no review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 1, stdout: '', stderr: 'boom' } });
  ctx.listWidgets();
  createRunPR(ctx.db);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(ctx.db.query("SELECT reviewed_sha, review_round, review_started_at IS NOT NULL AS started FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: null, review_round: 0, started: 1 });
});

test('it rejects a PR number that is not positive', async () => {
  const ctx = setupTest();

  await expect(runReview({ run: buildFakeRunner().run, db: ctx.db, rawRepo: 'widgets', pr: 0, watch: false })).rejects.toThrow('pr must be a positive number');
});

test('it runs a noslop review while a pin holds the clone lock', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  mkdirSync(join(ctx.base, '.lock-zgeoff-noslop-clone'));

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop', sha: PINNED });

  expect(fake.of('bun')[0]?.cmd[2]).toBe(`${ctx.base}/repos/zgeoff/noslop-${PINNED}/apps/cli/src/cli.ts`);
});

test('it always runs round 1 of a noslop PR and records its special as none', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 1, fullDropped: false });

  expect(ctx.db.query('SELECT special FROM noslop_rounds').all()).toStrictEqual([{ special: 'none' }]);
});

test('it records the special route noslop gave the review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), special: 'docs-only' }), stderr: '' } });
  ctx.listWidgets();

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  expect(ctx.db.query('SELECT special FROM noslop_rounds').all()).toStrictEqual([{ special: 'docs-only' }]);
});

test('it runs round 2 of a PR whose first review was standard', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2 });

  expect(fake.of('bun')).toHaveLength(1);
});

test.each([
  ['docs-only', 'standard', 'first review docs-only'],
  ['sync', 'standard', 'first review sync'],
  ['release', 'standard', 'first review release'],
  ['none', 'light', 'first review light'],
])('it refuses round 2 of a PR whose first review was %s at depth %s, and runs nothing', async (special, depth, reason) => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, depth, special);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'round_cap', message: `widgets#7 had its 1 noslop round(s) (cap 1: ${reason}). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate widgets 7 decides the merge. To check fixes pushed after the last round, run hq review widgets 7 --fixes-only. If a finding forced a redesign of logic patched in 2 rounds, hq review widgets 7 --redesign <finding-id> gives one more round.` });

  expect(fake.calls).toStrictEqual([]);
});

test('it decides a PR whose first review pre-dates the special by its depth', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'light', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'round_cap', message: 'widgets#7 had its 1 noslop round(s) (cap 1: first review light). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate widgets 7 decides the merge. To check fixes pushed after the last round, run hq review widgets 7 --fixes-only. If a finding forced a redesign of logic patched in 2 rounds, hq review widgets 7 --redesign <finding-id> gives one more round.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses round 3 of a PR whose first review was deep, with the exact message', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'deep', 'none');
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'round_cap', message: 'widgets#7 had its 2 noslop round(s) (cap 2: first review deep). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate widgets 7 decides the merge. To check fixes pushed after the last round, run hq review widgets 7 --fixes-only. If a finding forced a redesign of logic patched in 2 rounds, hq review widgets 7 --redesign <finding-id> gives one more round.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it does not count a failed review or a check as a round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'standard', 'none');
  ctx.addRound('review', 0, null, null);
  ctx.addRound('check', 1, null, null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2 });
});

test('it does not cap a PR on Codex however many rounds it has', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.addRound('review', 1, 'light', 'docs-only');
  ctx.addRound('review', 1, 'light', 'docs-only');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ codexCode: 0 });
});

test('it drops --full on round 2, says so, and gives noslop no --full flag', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true })).resolves.toMatchObject({ round: 2, fullDropped: true });

  expect(fake.of('bun')[0]?.cmd).not.toContain('--full');
  expect(ctx.db.query('SELECT full FROM noslop_rounds ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ full: 0 });
});

test('it keeps --full on round 1', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true })).resolves.toMatchObject({ round: 1, fullDropped: false });

  expect(fake.of('bun')[0]?.cmd).toContain('--full');
});

test('it runs one round past the cap with --redesign, as a delta review, and records the finding on it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);
  ctx.addReview('[]', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, redesign: 'kettle01' })).resolves.toMatchObject({ round: 3, fullDropped: false });

  expect(fake.of('bun')[0]?.cmd).not.toContain('--full');
  expect(ctx.db.query('SELECT redesign, full FROM noslop_rounds ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ redesign: 'kettle01', full: 0 });
});

test('it refuses --redesign while the PR still has a round inside its cap, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, redesign: 'kettle01' })).rejects.toMatchObject({ code: 'bad_redesign', message: '--redesign is for the round past the cap, but widgets#7 is on round 2 of cap 2: run hq review without it.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses a second --redesign round on a PR, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);
  ctx.addReview('[]', null);
  ctx.addReview('[]', 'kettle01');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, redesign: 'kettle01' })).rejects.toMatchObject({ code: 'bad_redesign', message: 'widgets#7 already had its redesign round, for finding kettle01. A PR gets one.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses --redesign for a finding no review of the PR raised, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);
  ctx.addReview('[]', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, redesign: 'teapot99' })).rejects.toMatchObject({ code: 'bad_redesign', message: 'finding teapot99 is in no noslop review of widgets#7: --redesign names a finding a review raised.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses --redesign on a PR reviewed by Codex, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, redesign: 'kettle01' })).rejects.toMatchObject({ code: 'bad_redesign', message: '--redesign gives a noslop PR one round past its cap, but widgets#7 is reviewed by Codex, which has no cap' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses --redesign with --full, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);
  ctx.addReview('[]', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true, redesign: 'kettle01' })).rejects.toMatchObject({ code: 'bad_redesign', message: '--redesign reviews only the commits since the last round, so it cannot be given with --full' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses the round after a redesign round without the --redesign hint', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle01","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null);
  ctx.addReview('[]', null);
  ctx.addReview('[]', 'kettle01');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'round_cap', message: 'widgets#7 had its 3 noslop round(s) (cap 2: first review standard). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate widgets 7 decides the merge. To check fixes pushed after the last round, run hq review widgets 7 --fixes-only.' });

  expect(fake.calls).toStrictEqual([]);
});

test('it checks the round cap only under the PR\'s lock, and runs nothing while another review holds it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  onTestFinished(overrideEnv('HQ_REVIEW_LOCK_WAIT_MS', '0'));
  mkdirSync(join(ctx.base, '.lock-zgeoff-widgets-pr7'));

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'locked' });

  expect(fake.calls).toStrictEqual([]);
});

test('it lets only one of two reviews started together on one PR take its last round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(Promise.allSettled([runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false }), runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })])).resolves.toStrictEqual([
    { status: 'fulfilled', value: expect.objectContaining({ round: 2 }) },
    { status: 'rejected', reason: expect.objectContaining({ code: 'round_cap' }) },
  ]);
  expect(fake.of('bun')).toHaveLength(1);
});

test('it exits 1 from hq review past the cap, with the round_cap code and message as JSON', async () => {
  const ctx = setupTest(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.listWidgets();
  ctx.addRound('review', 1, 'light', 'none');

  await expect(main(['review', 'widgets', '7', '--json'])).resolves.toBe(1);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: false, error: { code: 'round_cap', message: 'widgets#7 had its 1 noslop round(s) (cap 1: first review light). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate widgets 7 decides the merge. To check fixes pushed after the last round, run hq review widgets 7 --fixes-only. If a finding forced a redesign of logic patched in 2 rounds, hq review widgets 7 --redesign <finding-id> gives one more round.' } });
});

test('it forwards --fixes-only from hq review to noslop, and prints the fix checks as JSON', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({
        version: 7,
        head: 'feat',
        base: 'main',
        depth: 'standard',
        findings: [],
        failedCalls: [],
        notReviewed: [],
        notReviewedByLens: [],
        fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now' }],
      }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"kettle0000000001"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') }),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(main(['review', 'widgets', '7', '--fixes-only', '--no-watch', '--json'], fake.run)).resolves.toBe(0);

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: true, engine: 'noslop', fixesOnly: true, fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' }] });
});

test('it runs --fixes-only past the cap through noslop with --fixes-only, and stores a run that is not a round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({
        version: 7,
        head: 'feat',
        base: 'main',
        depth: 'standard',
        findings: [],
        failedCalls: [],
        notReviewed: [],
        notReviewedByLens: [],
        fixChecks: [
          { findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now' },
          { findingID: 'kettle0000000002', fixed: false, reason: 'the lid still leaks' },
        ],
      }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"kettle0000000001"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');
  ctx.addReview('[]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({
    fixesOnly: true,
    round: 2,
    findings: [],
    fixChecks: [
      { findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' },
      { findingID: 'kettle0000000002', fixed: false, reason: 'the lid still leaks', title: null },
    ],
  });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
  expect(fake.of('bun')[0]?.cmd).not.toContain('--full');
  expect(ctx.db.query('SELECT confirm, redesign, kind, ok FROM noslop_rounds ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ confirm: 1, redesign: null, kind: 'review', ok: 1 });
});

test('it runs --fixes-only inside the cap, as often as asked, and still allows a plain round after', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({
        version: 7,
        head: 'feat',
        base: 'main',
        depth: 'standard',
        findings: [],
        failedCalls: [],
        notReviewed: [],
        notReviewedByLens: [],
        fixChecks: [
          { findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now' },
          { findingID: 'kettle0000000002', fixed: false, reason: 'the lid still leaks' },
        ],
      }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"kettle0000000001"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  await expect(runReview({ run: buildFakeRunner().run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2, fixesOnly: false });
});

test('it runs --fixes-only when a fixed answer in a finding thread names a commit since the last review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only after a round whose review noslop stored but could not post to GitHub', async () => {
  const ctx = setupTest();
  const reviewHead = 'aaaa000000000000000000000000000000000001';
  const stored = buildFakeRunner({ noslopReview: { code: 1, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), head: reviewHead, base: null }), stderr: 'the github reporter failed: HTTP 500' } });
  const fixesOnly = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { [`git rev-list --reverse --first-parent ${reviewHead}..refs/hq/pr/7`]: { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  mkdirSync(join(ctx.base, 'data', 'noslop'), { recursive: true });
  const store = new Database(join(ctx.base, 'data', 'noslop', 'store.sqlite'), { create: true });
  store.run('CREATE TABLE reviews (review_id TEXT PRIMARY KEY, repo TEXT NOT NULL, pull_request INTEGER, head TEXT NOT NULL)');
  store.query('INSERT INTO reviews (review_id, repo, pull_request, head) VALUES (?, ?, ?, ?)').run('r1', 'zgeoff/widgets', 7, reviewHead);
  store.close();
  await runReview({ run: stored.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  await expect(runReview({ run: fixesOnly.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true, round: 1, fixChecks: [] });

  expect(fixesOnly.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only when a fixed answer in an issue comment names a commit since the last review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, issueComments: [JSON.stringify({ body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ body: '00112233445566aa fixed cccc000\nthe kettle boils now' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it records the head and noslop refusal text when noslop refuses a --fixes-only run', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 1, stdout: '', stderr: 'noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review\n' }, git: { 'git rev-parse --verify -q refs/hq/pr/7^{commit}': { code: 0, stdout: 'dddd000000000000000000000000000000000003\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'noslop_failed' });

  expect(JSON.parse(getMeta(ctx.db, 'noslop_fixes_only_refused:widgets#7') ?? 'null')).toStrictEqual({ head: 'dddd000000000000000000000000000000000003', why: 'exit 1: noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review', at: expect.any(String) });
});

test('it clears a recorded --fixes-only refusal when a --fixes-only run succeeds', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-parse --verify -q refs/hq/pr/7^{commit}': { code: 0, stdout: 'dddd000000000000000000000000000000000003\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');
  setMeta(ctx.db, 'noslop_fixes_only_refused:widgets#7', JSON.stringify({ head: 'dddd000000000000000000000000000000000003', why: 'exit 1: noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review', at: '2026-10-20T01:00:00.000Z' }));
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  expect(getMeta(ctx.db, 'noslop_fixes_only_refused:widgets#7')).toBeNull();
});

test('it refuses --fixes-only when no fixed answer names a commit since the last review, and runs no noslop', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: '1 commit(s) after the last review (aaaa000) are not accounted for: cccc000. No lens has read them. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.' });

  expect(fake.of('bun')).toStrictEqual([]);
  expect(fake.of('op')).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS n FROM noslop_rounds').get()).toStrictEqual({ n: 1 });
});

test('it exits 1 with fixes_only_no_fix in --json when hq review --fixes-only is refused', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } } }),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.listWidgets();
  ctx.addReview('[]', null, 'aaaa000000000000000000000000000000000001');

  await expect(main(['review', 'widgets', '7', '--fixes-only', '--no-watch', '--json'], fake.run)).resolves.toBe(1);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: false, error: { code: 'fixes_only_no_fix', message: '1 commit(s) after the last review (aaaa000) are not accounted for: cccc000. No lens has read them. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.' } });
});

test('it refuses --fixes-only when one commit since the last review is named by a fixed answer and another is not, naming the other', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\ncccc111000000000000000000000000000000007\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"},{"id":"00112233445566bb","lens":"correctness","severity":"high","title":"Lid leaks"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: '1 commit(s) after the last review (aaaa000) are not accounted for: cccc111. No lens has read them. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.' });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it runs --fixes-only when each of two fix commits is named by its own fixed answer', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\ncccc111000000000000000000000000000000007\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' }), JSON.stringify({ id: 3, in_reply_to_id: null, body: 'Lid leaks\n<!-- noslop:finding {"id":"00112233445566bb"} -->' }), JSON.stringify({ id: 4, in_reply_to_id: 3, body: 'fixed cccc111' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"},{"id":"00112233445566bb","lens":"correctness","severity":"high","title":"Lid leaks"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it refuses --fixes-only when the only fixed answer names the last reviewed commit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed aaaa000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: '1 commit(s) after the last review (aaaa000) are not accounted for: cccc000. No lens has read them. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.' });

  expect(fake.of('bun')).toStrictEqual([]);
  expect(fake.of('op')).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS n FROM noslop_rounds').get()).toStrictEqual({ n: 1 });
});

test('it runs --fixes-only when the only commit since the last review is a clean merge', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only when the merge since the last review had conflicts', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 1, stdout: 'eeee000000000000000000000000000000000005\nCONFLICT (content): Merge conflict in kettle.ts\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only when the merge since the last review holds a hand edit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'ffff000000000000000000000000000000000006\n', stderr: '' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only with no fixed answer when the only commit after the last review is a clean merge of the base, on a real repo', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' } }),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git merge -q --no-edit main
git push -q origin main feat:refs/pull/7/head
git rev-parse feat^1`);
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it runs --fixes-only on a real repo when the merge after the last review resolves a conflict', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' } }),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
git checkout -q main
printf 'warm\\n' > kettle.txt
git commit -q -am warm
git checkout -q feat
git merge -q --no-edit main > /dev/null || true
printf 'hot and warm\\n' > kettle.txt
git commit -q -am 'merge main'
git push -q origin main feat:refs/pull/7/head
git rev-parse feat^1`);
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).resolves.toMatchObject({ fixesOnly: true });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it refuses --fixes-only on a real repo when the merge after the last review merges a branch other than the base, naming only the merge', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' } }),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
git checkout -q -b teapot
printf 'spout\\n' > teapot.txt
git add -A
git commit -q -m teapot
git checkout -q feat
git merge -q --no-ff --no-edit teapot
git push -q origin main feat:refs/pull/7/head
git rev-parse feat^1`);
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).rejects.toMatchObject({
    code: 'fixes_only_no_fix',
    message: expect.stringMatching(/^1 commit\(s\) after the last review \([0-9a-f]{7}\) are not accounted for: [0-9a-f]{7} \(merge\)\. No lens has read them\. A merge of a branch other than the base brings in code no lens has read: move it to a new PR, or drop it\.$/u),
  });

  expect(fake.of('bun')).toStrictEqual([]);
});

async function setupStackedRepo(ctx: ReturnType<typeof setupTest>): Promise<{ lensHead: string; later: string; squash: string }> {
  const printed = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b teapot
printf 'spout\\n' > teapot.txt
git add -A
git commit -q -m teapot
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q teapot
printf 'spout and lid\\n' > teapot.txt
git commit -q -am 'teapot lid'
later=$(git rev-parse HEAD)
git checkout -q feat
git merge -q --no-ff --no-edit teapot
git checkout -q main
git merge -q --squash teapot > /dev/null
git commit -q -m 'teapot (#6)'
squash=$(git rev-parse HEAD)
git checkout -q feat
git merge -q --no-ff --no-edit main
git push -q origin main feat:refs/pull/7/head
echo "$lens $later $squash"`),
    [lensHead = '', later = '', squash = ''] = printed.split(' ');
  return { lensHead, later, squash };
}

function buildOKReview(): RunResult {
  return { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' };
}

test('it runs --fixes-only on a real repo whose merges bring in a parent PR that squash-merged into the base', async () => {
  const ctx = setupTest(),
    heads = await setupStackedRepo(ctx),
    runner = buildFakeRunner({ realGit: true, noslopReview: buildOKReview(), commitPulls: { [heads.later]: JSON.stringify([{ number: 6, merged_at: '2026-10-20T00:00:00Z', merge_commit_sha: heads.squash, base: { ref: 'main' } }, { number: 7, merged_at: null, merge_commit_sha: null, base: { ref: 'teapot' } }]) } });
  ctx.listWidgets();
  ctx.addReview('[]', null, heads.lensHead);

  await expect(runReview({ run: runner.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).resolves.toMatchObject({ fixesOnly: true });

  expect(runner.of('bun')[0]?.cmd).toContain('--fixes-only');
});

test('it refuses --fixes-only on a real repo when the merged PR whose commit a merge brings in has its merge commit outside the base', async () => {
  const ctx = setupTest(),
    heads = await setupStackedRepo(ctx),
    runner = buildFakeRunner({ realGit: true, noslopReview: buildOKReview(), commitPulls: { [heads.later]: JSON.stringify([{ number: 6, merged_at: '2026-10-20T00:00:00Z', merge_commit_sha: heads.later, base: { ref: 'main' } }]) } });
  ctx.listWidgets();
  ctx.addReview('[]', null, heads.lensHead);

  await expect(runReview({ run: runner.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: expect.stringContaining('A merge of a branch other than the base') });

  expect(runner.of('bun')).toStrictEqual([]);
});

test('it runs --fixes-only on a real repo past the round cap when every commit since the last review is a merge of the base', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, noslopReview: buildOKReview() }),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git merge -q --no-edit main
git push -q origin main feat:refs/pull/7/head
git rev-parse feat^1`);
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);
  ctx.addReview('[]', null, lensHead);
  ctx.addReview('[]', null, lensHead);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, repoDir: join(ctx.base, 'work') })).rejects.toMatchObject({ code: 'round_cap' });
  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).resolves.toMatchObject({ fixesOnly: true });
});

test('it marks the PR on its run reviewed at the head a --fixes-only run checked', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, noslopReview: buildOKReview() }),
    heads = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git merge -q --no-edit main
git push -q origin main feat:refs/pull/7/head
echo "$(git rev-parse feat^1) $(git rev-parse feat)"`),
    [lensHead = '', head = ''] = heads.split(' ');
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);
  createRunPR(ctx.db);

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') });

  expect(ctx.db.query("SELECT reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: head, review_round: 1 });
});

test('it refuses --fixes-only on a rebased real repo with the hq cannot tell text when git fails to give a patch id', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true, git: { 'git patch-id --stable': { code: 128, stdout: '', stderr: 'fatal: patch-id broke' } } }),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git rebase -q main
git push -q origin main feat:refs/pull/7/head
echo "$lens"`);
  ctx.listWidgets();
  ctx.addReview('[]', null, lensHead);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, repoDir: join(ctx.base, 'work') })).rejects.toMatchObject({
    code: 'fixes_only_no_fix',
    message: 'hq cannot tell which commits after the last review no lens has read (git cannot give the patch ids of 2 commit(s): fatal: patch-id broke), so --fixes-only cannot stand for a review of this head.',
  });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses --fixes-only when the base branch cannot be fetched to check a merge', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git fetch -q origin main': { code: 128, stdout: '', stderr: "fatal: couldn't find remote ref main" } } });
  ctx.listWidgets();
  ctx.addReview('[]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: "hq cannot tell which commits after the last review no lens has read (git cannot fetch the base branch main: fatal: couldn't find remote ref main), so --fixes-only cannot stand for a review of this head." });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses --fixes-only when gh prints a comment line hq cannot read, and runs no noslop', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: '{"id":"one","body":"fixed cccc000"}' });
  ctx.listWidgets();
  ctx.addReview('[]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'command_failed', message: 'gh api repos/zgeoff/widgets/pulls/7/comments printed a line that is not a comment: {"id":"one","body":"fixed cccc000"}' });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses --fixes-only when the last review stored no head', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[]', null, null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: 'hq cannot tell which commits after the last review no lens has read (the last review stored no head), so --fixes-only cannot stand for a review of this head.' });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses --fixes-only before the PR has a review that ran its lenses, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 0, null, null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'bad_fixes_only', message: '--fixes-only checks the fixes of an earlier review, but widgets#7 has had no noslop review that ran its lenses: run hq review without it.' });

  expect(fake.calls).toStrictEqual([]);
});

test.each([
  ['--full', { full: true }],
  ['--redesign', { redesign: 'kettle01' }],
])('it refuses --fixes-only with %s, and runs nothing', async (_flag, extra) => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[]', null);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, ...extra })).rejects.toMatchObject({ code: 'bad_fixes_only', message: '--fixes-only runs no lens over the diff, so it cannot be given with --full or --redesign' });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses --fixes-only on a PR reviewed by Codex, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'bad_fixes_only', message: "--fixes-only checks a noslop PR's fixes, but widgets#7 is reviewed by Codex" });

  expect(fake.calls).toStrictEqual([]);
});

test('it refuses --confirm with a pointer to --fixes-only, on a noslop PR and a Codex PR, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    message = '--confirm was removed in 0.62.0: run hq review <repo> <pr> --fixes-only';

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, confirm: true })).rejects.toMatchObject({ code: 'bad_confirm', message });
  ctx.listWidgets();
  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, confirm: true })).rejects.toMatchObject({ code: 'bad_confirm', message });

  expect(fake.calls).toStrictEqual([]);
});

test('it keeps counting a stored --confirm review as not a round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addReview('[]', null);
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, depth, special, findings, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'standard', 'none', '[]', 'x', 1)").run();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2 });
});

test('it refuses --fixes-only when git cannot read the parents of a commit a fixed answer names, and runs no noslop', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' }, 'git rev-list --parents -n 1 cccc000000000000000000000000000000000002': { code: 128, stdout: '', stderr: 'fatal: bad object cccc000000000000000000000000000000000002\n' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000' })].join('\n') });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: 'hq cannot tell which commits after the last review no lens has read (git cannot read the parents of cccc000: fatal: bad object cccc000000000000000000000000000000000002), so --fixes-only cannot stand for a review of this head.' });

  expect(fake.of('bun')).toStrictEqual([]);
});

test('it refuses --fixes-only when git gives no answer on whether a merge since the last review brings in only the base', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ version: 7, head: 'feat', base: 'main', depth: 'standard', findings: [], failedCalls: [], notReviewed: [], notReviewedByLens: [], fixChecks: [] }), stderr: '' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-base --is-ancestor bbbb000000000000000000000000000000000003 origin/main': { code: 128, stdout: '', stderr: 'fatal: Not a valid commit name bbbb000000000000000000000000000000000003\n' } } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"00112233445566aa","lens":"correctness","severity":"high","title":"Kettle never boils"}]', null, 'aaaa000000000000000000000000000000000001');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).rejects.toMatchObject({ code: 'fixes_only_no_fix', message: 'hq cannot tell which commits after the last review no lens has read (git cannot tell whether bbbb000 is in origin/main: fatal: Not a valid commit name bbbb000000000000000000000000000000000003), so --fixes-only cannot stand for a review of this head.' });

  expect(fake.of('bun')).toStrictEqual([]);
});
