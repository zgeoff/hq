import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_FULL_SHA, FAKE_REVIEW_JSON, FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
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

    addReview: (findings: string, head: string | null = null) => db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, 'standard', 'none', ?, 'x')").run(head, findings),
    addRound: (kind: 'review' | 'check', ok: number, depth: string | null, special: string | null) => db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, depth, special, sha) VALUES ('widgets', 7, ?, 'a', 'b', 1, ?, ?, ?, 'x')").run(kind, ok, depth, special),
    listWidgets: () => setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: PINNED })),
    setCap: (repo: string, cap: number) => setMeta(db, 'noslop', JSON.stringify({ repos: [repo], sha: PINNED, caps: { [repo]: cap } })),
    listUnpinned: () => setMeta(db, 'noslop', JSON.stringify({ repos: ['widgets'], sha: null })),

    // A review of widgets#7 while GitHub gives the PR this head, noslop reviews it, and each head's
    // PR diff has the patch-id given.
    reviewAt: async (head: string, patchIds: Record<string, string>, full?: boolean) => {
      const fake = buildFakeRunner({
        noslopReview: { code: 0, stdout: FAKE_REVIEW_JSON.replace('"head":"feat"', `"head":"${head}"`), stderr: '' },
        prRefs: { code: 0, stdout: JSON.stringify({ headRefOid: head, baseRefName: 'main' }), stderr: '' },
        patchIds,
      });
      const outcome = await runReview({ run: fake.run, db, rawRepo: 'widgets', pr: 7, watch: false, full });
      return { outcome, fixesOnly: fake.of('bun').some((call) => call.cmd.includes('--fixes-only')) };
    },
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

test('it reviews a listed repo\'s PR on noslop though a Codex review file of the PR exists', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.listWidgets();
  mkdirSync(join(ctx.base, 'zgeoff/widgets'), { recursive: true });
  writeFileSync(join(ctx.base, 'zgeoff/widgets/7-review.md'), 'No findings.\n');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop' });

  expect(fake.of('codex')).toStrictEqual([]);
});

test('it reviews a listed repo\'s PR on noslop though a Codex review file of the PR has the flat name from before review folders', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.listWidgets();
  writeFileSync(join(ctx.base, 'widgets7-review.md'), 'No findings.\n');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop' });

  expect(fake.of('codex')).toStrictEqual([]);
});

test('it reviews a listed repo\'s PR on noslop though a run already gave it a Codex round', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.db.exec('PRAGMA foreign_keys = OFF');
  ctx.db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-1', 'open', 1, '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z')").run();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop' });

  expect(fake.of('codex')).toStrictEqual([]);
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

test('it runs a first review of a noslop PR and records its special as none', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 1, fixesOnly: false, emergencyCap: null, capNote: null });

  expect(ctx.db.query('SELECT special FROM noslop_rounds').all()).toStrictEqual([{ special: 'none' }]);
});

test('it records the special route noslop gave the review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopReview: { code: 0, stdout: JSON.stringify({ ...JSON.parse(FAKE_REVIEW_JSON), special: 'docs-only' }), stderr: '' } });
  ctx.listWidgets();

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  expect(ctx.db.query('SELECT special FROM noslop_rounds').all()).toStrictEqual([{ special: 'docs-only' }]);
});

test('it runs a full review however many reviews the PR has had, while no cap is set', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'light', 'docs-only');
  ctx.addRound('review', 1, 'light', 'docs-only');
  ctx.addRound('review', 1, 'light', 'docs-only');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 4, fixesOnly: false });

  expect(fake.of('bun')[0]?.cmd).not.toContain('--fixes-only');
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

test('it keeps --full on a later review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true })).resolves.toMatchObject({ round: 2 });

  expect(fake.of('bun')[0]?.cmd).toContain('--full');
});

test('it takes the PR\'s lock for the review, and runs nothing while another review holds it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  onTestFinished(overrideEnv('HQ_REVIEW_LOCK_WAIT_MS', '0'));
  mkdirSync(join(ctx.base, '.lock-zgeoff-widgets-pr7'));

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).rejects.toMatchObject({ code: 'locked' });

  expect(fake.calls).toStrictEqual([]);
});

test('it runs a full review while the emergency cap is not reached', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 1);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 1, fixesOnly: false, emergencyCap: null });

  expect(fake.of('bun')[0]?.cmd).not.toContain('--fixes-only');
});

test('it runs the second review as fix checks only, and says so, when the emergency cap is 1', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 1);
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ engine: 'noslop', fixesOnly: true, emergencyCap: 1, capNote: 'fix checks only: emergency cap 1 reached for widgets; no new findings' });

  expect(fake.of('bun').map((call) => call.cmd.includes('--fixes-only'))).toStrictEqual([false, true]);
  expect(ctx.db.query('SELECT confirm FROM noslop_rounds ORDER BY id').all()).toStrictEqual([{ confirm: 0 }, { confirm: 1 }]);
});

test('it applies an emergency cap stored under the repo name in another case, as the noslop list matches it', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.setCap('Widgets', 1);
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'zgeoff/widgets', pr: 7, watch: false })).resolves.toMatchObject({ fixesOnly: true, emergencyCap: 1 });
});

test('it runs the second review in full when the emergency cap is off', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();
  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false });

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2, fixesOnly: false, emergencyCap: null, capNote: null });

  expect(fake.of('bun').map((call) => call.cmd.includes('--fixes-only'))).toStrictEqual([false, false]);
});

test('it counts only the full reviews against the emergency cap, not fix checks or failed reviews', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 2);
  ctx.addRound('review', 1, 'standard', 'none');
  ctx.addRound('review', 0, null, null);
  ctx.addRound('check', 1, null, null);
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, depth, special, findings, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'standard', 'none', '[]', 'x', 1)").run();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2, fixesOnly: false });
});

test('it counts the emergency cap per PR', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 1);
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 8, watch: false })).resolves.toMatchObject({ round: 1, fixesOnly: false });
});

test('it drops --full past the emergency cap', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 1);
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, full: true })).resolves.toMatchObject({ fixesOnly: true, emergencyCap: 1 });

  expect(fake.of('bun')[0]?.cmd).not.toContain('--full');
});

test('it lets only one of two reviews started together on one PR take the last full review before the cap', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.setCap('widgets', 1);

  const settled = await Promise.all([runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false }), runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })]);

  expect(settled).toStrictEqual(expect.arrayContaining([expect.objectContaining({ fixesOnly: false }), expect.objectContaining({ fixesOnly: true })]));
  expect(fake.of('bun').map((call) => call.cmd.includes('--fixes-only')).toSorted()).toStrictEqual([false, true]);
});

test('it prints the cap note first in the text of hq review past the cap', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.setCap('widgets', 1);
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(main(['review', 'widgets', '7', '--no-watch'], fake.run)).resolves.toBe(0);

  expect(lines[0]?.split('\n')[0]).toBe('fix checks only: emergency cap 1 reached for widgets; no new findings');
});

test('it forwards the cap note and fixesOnly in the JSON of hq review past the cap', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.setCap('widgets', 1);
  ctx.addRound('review', 1, 'standard', 'none');

  await expect(main(['review', 'widgets', '7', '--no-watch', '--json'], fake.run)).resolves.toBe(0);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: true, engine: 'noslop', fixesOnly: true, emergencyCap: 1, capNote: 'fix checks only: emergency cap 1 reached for widgets; no new findings' });
});

test('it passes --fixes-only straight to noslop, with no review on record, and records a run that is not a round', async () => {
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
      }), stderr: '' } });
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]');
  createRunPR(ctx.db);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({
    fixesOnly: true,
    emergencyCap: null,
    capNote: null,
    round: 1,
    findings: [],
    fixChecks: [
      { findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' },
      { findingID: 'kettle0000000002', fixed: false, reason: 'the lid still leaks', title: null },
    ],
  });

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
  expect(fake.of('bun')[0]?.cmd).not.toContain('--full');
  expect(fake.lines().filter((line) => line.startsWith('git rev-list'))).toStrictEqual([]);
  expect(ctx.db.query('SELECT confirm, kind, ok FROM noslop_rounds ORDER BY id DESC LIMIT 1').get()).toStrictEqual({ confirm: 1, kind: 'review', ok: 1 });
});

test('it leaves the head a hand-run --fixes-only run ran on unmarked, and counts no round', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ noslopReview: { code: 0, stdout: FAKE_REVIEW_JSON.replace('"head":"feat"', `"head":"${FAKE_FULL_SHA}"`), stderr: '' } });
  ctx.listWidgets();
  createRunPR(ctx.db);

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  expect(ctx.db.query("SELECT reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: null, review_round: 0 });
  expect(ctx.db.query("SELECT COUNT(*) AS rounds FROM noslop_rounds WHERE confirm = 0").get()).toStrictEqual({ rounds: 0 });
});

test('it marks the head a fix-checks-only run past the emergency cap ran on reviewed, without counting a round', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ noslopReview: { code: 0, stdout: FAKE_REVIEW_JSON.replace('"head":"feat"', `"head":"${FAKE_FULL_SHA}"`), stderr: '' } });
  ctx.setCap('widgets', 1);
  createRunPR(ctx.db);
  ctx.addReview('[]', 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed');

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ fixesOnly: true, emergencyCap: 1, round: 1 });

  expect(ctx.db.query("SELECT reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: FAKE_FULL_SHA, review_round: 0 });
  expect(ctx.db.query("SELECT COUNT(*) AS rounds FROM noslop_rounds WHERE confirm = 0").get()).toStrictEqual({ rounds: 1 });
});

test('it leaves the head a hand-run --fixes-only run past the emergency cap ran on unmarked', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ noslopReview: { code: 0, stdout: FAKE_REVIEW_JSON.replace('"head":"feat"', `"head":"${FAKE_FULL_SHA}"`), stderr: '' } });
  ctx.setCap('widgets', 1);
  createRunPR(ctx.db);
  ctx.addReview('[]', 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed');

  await runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true });

  expect(ctx.db.query("SELECT reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: null, review_round: 0 });
});

test('it passes --fixes-only to noslop when the PR has no review at all, past any cap', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  ctx.setCap('widgets', 1);

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true })).resolves.toMatchObject({ fixesOnly: true, emergencyCap: null, round: 0 });
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
      }), stderr: '' } });
  const lines: string[] = [];
  const logger = spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line);
  });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'hq.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  ctx.listWidgets();
  ctx.addReview('[{"id":"kettle0000000001","lens":"correctness","severity":"high","title":"Kettle never boils"}]');

  await expect(main(['review', 'widgets', '7', '--fixes-only', '--no-watch', '--json'], fake.run)).resolves.toBe(0);

  expect(fake.of('bun')[0]?.cmd).toContain('--fixes-only');
  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: true, engine: 'noslop', fixesOnly: true, fixChecks: [{ findingID: 'kettle0000000001', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' }] });
});

test('it refuses --fixes-only with --full, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  ctx.listWidgets();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false, fixesOnly: true, full: true })).rejects.toMatchObject({ code: 'bad_fixes_only', message: '--fixes-only and --full contradict: --fixes-only runs no lens over the diff, and --full asks for a review of the whole PR' });

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
  ctx.addReview('[]');
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, depth, special, findings, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'standard', 'none', '[]', 'x', 1)").run();

  await expect(runReview({ run: fake.run, db: ctx.db, rawRepo: 'widgets', pr: 7, watch: false })).resolves.toMatchObject({ round: 2 });
});

test('a push that only moves the base, with the same PR diff, runs fix checks only, is no round, and marks the new head reviewed', async () => {
  const ctx = setupTest();
  ctx.listWidgets();
  createRunPR(ctx.db);
  const patchIds = { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff', b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2: 'kettle-diff' };
  await ctx.reviewAt('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', patchIds);

  const moved = await ctx.reviewAt('b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', patchIds);

  expect(moved.fixesOnly).toBe(true);
  expect(moved.outcome).toMatchObject({ fixesOnly: true, baseMove: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', round: 1 });
  expect(ctx.db.query('SELECT head, patch_id, confirm, base_move FROM noslop_rounds ORDER BY id').all()).toStrictEqual([
    { head: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', patch_id: 'kettle-diff', confirm: 0, base_move: 0 },
    { head: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', patch_id: 'kettle-diff', confirm: 1, base_move: 1 },
  ]);
  expect(ctx.db.query("SELECT reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get()).toStrictEqual({ reviewed_sha: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', review_round: 1 });
});

test('a push that changes the PR diff is a round', async () => {
  const ctx = setupTest();
  ctx.listWidgets();
  const patchIds = { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff', b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2: 'kettle-diff-with-lid' };
  await ctx.reviewAt('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', patchIds);

  const changed = await ctx.reviewAt('b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', patchIds);

  expect(changed.fixesOnly).toBe(false);
  expect(changed.outcome).toMatchObject({ fixesOnly: false, baseMove: null, round: 2 });
});

test('a push back to a diff reviewed before the last review is a round: only the last ok review counts', async () => {
  const ctx = setupTest();
  ctx.listWidgets();
  const patchIds = { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff', b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2: 'kettle-diff-with-lid', c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3: 'kettle-diff' };
  await ctx.reviewAt('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', patchIds);
  await ctx.reviewAt('b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', patchIds);

  const reverted = await ctx.reviewAt('c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3', patchIds);

  expect(reverted.outcome).toMatchObject({ fixesOnly: false, baseMove: null, round: 3 });
});

test('--full runs a round though only the base moved', async () => {
  const ctx = setupTest();
  ctx.listWidgets();
  const patchIds = { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff', b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2: 'kettle-diff' };
  await ctx.reviewAt('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', patchIds);

  const full = await ctx.reviewAt('b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', patchIds, true);

  expect(full.outcome).toMatchObject({ fixesOnly: false, baseMove: null, round: 2 });
});

test('a push to a head whose PR diff git cannot read is a round', async () => {
  const ctx = setupTest();
  ctx.listWidgets();
  await ctx.reviewAt('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff' });

  const unread = await ctx.reviewAt('b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', { a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1: 'kettle-diff' });

  expect(unread.outcome).toMatchObject({ fixesOnly: false, baseMove: null, round: 2 });
});
