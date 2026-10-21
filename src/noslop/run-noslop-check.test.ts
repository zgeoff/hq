import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAKE_TOKEN, buildFakeRunner } from '../../test/noslop-fake.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import { setMeta } from '../db/set-meta.ts';
import { runNoslopCheck } from './run-noslop-check.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-run-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  writeFileSync(join(base, 'settings.json'), JSON.stringify({ env: { OP_SERVICE_ACCOUNT_TOKEN: FAKE_TOKEN } }));
  onTestFinished(overrideEnv('HQ_NOSLOP_OP_SETTINGS', join(base, 'settings.json')));

  return { base, db };
}

test('it records no --full value on a check', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' });

  expect(ctx.db.query('SELECT kind, full FROM noslop_rounds').get()).toStrictEqual({ kind: 'check', full: null });
});

test('it stores a check outcome with its open findings', async () => {
  const ctx = setupTest(),
    findings = [{ id: '00112233445566aa', title: 'Kettle never boils', reason: 'no reply yet' }],
    runner = buildFakeRunner({ noslopCheck: { code: 0, stdout: JSON.stringify({ conclusion: 'failure', title: '1 finding open', summary: 'One.', open: findings }), stderr: '' } }),
    verdict = await runNoslopCheck({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' });

  expect(verdict).toMatchObject({ conclusion: 'failure', title: '1 finding open', open: findings });
  expect(ctx.db.query('SELECT kind, ok, conclusion, open, error FROM noslop_rounds').get()).toStrictEqual({ kind: 'check', ok: 1, conclusion: 'failure', open: JSON.stringify(findings), error: null });
  expect(runner.of('bun')[0]?.cmd.slice(3)).toStrictEqual(['check', '--pr', '7', '--repo', 'zgeoff/widgets', '--json']);
});

test('it throws noslop_failed and records no check when noslop check exits 1', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'no app install' } });

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: no app install): this is no pass.',
  });

  expect(ctx.db.query('SELECT kind, ok, conclusion FROM noslop_rounds').all()).toStrictEqual([{ kind: 'check', ok: 0, conclusion: null }]);
});

test('it points to --fixes-only when noslop has not read the head and a fixed answer names a commit since the last review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed cccc000\nthe kettle boils now' })].join('\n') });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. To check the fixes on this head without a new round, run hq review widgets 7 --fixes-only.',
  });
});

test('it names a new review round, not --fixes-only, when noslop refused --fixes-only on this head', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-parse --verify -q refs/hq/pr/7^{commit}': { code: 0, stdout: 'dddd000000000000000000000000000000000003\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();
  setMeta(ctx.db, 'noslop_fixes_only_refused:widgets#7', JSON.stringify({ head: 'dddd000000000000000000000000000000000003', why: 'exit 1: noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review', at: '2026-10-20T01:00:00.000Z' }));

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. noslop refused --fixes-only on this head (exit 1: noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review). The next step is a new review round: hq review widgets 7.',
  });
});

test('it still points to --fixes-only when noslop refused --fixes-only on an older head', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-parse --verify -q refs/hq/pr/7^{commit}': { code: 0, stdout: 'eeee000000000000000000000000000000000004\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();
  setMeta(ctx.db, 'noslop_fixes_only_refused:widgets#7', JSON.stringify({ head: 'dddd000000000000000000000000000000000003', why: 'exit 1: noslop: --fixes-only has no `fixed` answer to check, and no commit came after the last review', at: '2026-10-20T01:00:00.000Z' }));

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. To check the fixes on this head without a new round, run hq review widgets 7 --fixes-only.',
  });
});

test('it says the head needs a review round when no fixed answer names a commit since the last review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. 1 commit(s) after the last review (aaaa000) are not accounted for: cccc000. No lens has read them. This head cannot pass until those commits are answered, moved or checked. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.',
  });
});

test('it says the head needs a review round when the only fixed answer names the last reviewed commit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'cccc000000000000000000000000000000000002\n', stderr: '' } }, reviewComments: [JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' }), JSON.stringify({ id: 2, in_reply_to_id: 1, body: 'fixed aaaa000\nthe kettle boils now' })].join('\n') });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. 1 commit(s) after the last review (aaaa000) are not accounted for: cccc000. No lens has read them. This head cannot pass until those commits are answered, moved or checked. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.',
  });
});

test('it points to --fixes-only when the only commit since the last review is a clean merge', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. To check the fixes on this head without a new round, run hq review widgets 7 --fixes-only.',
  });
});

test('it says noslop has not checked the resolution when the merge since the last review had conflicts', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 1, stdout: 'eeee000000000000000000000000000000000005\nCONFLICT (content): Merge conflict in kettle.ts\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. 1 commit(s) after the last review (aaaa000) are not accounted for: dddd000 (merge). No lens has read them. This head cannot pass until those commits are answered, moved or checked. noslop checks the conflict resolution of a merge in a fixes-only run, which has not checked this one yet: run hq review <repo> <pr> --fixes-only, and answer any finding it raises.',
  });
});

test('it points to --fixes-only when the summary marker lists the merge since the last review as checked', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ markerComments: { code: 0, stdout: JSON.stringify({ login: 'noslop-review[bot]', body: `<!-- noslop:summary {"checkedMerges":["dddd000000000000000000000000000000000004"]} -->` }), stderr: '' }, noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 1, stdout: 'eeee000000000000000000000000000000000005\nCONFLICT (content): Merge conflict in kettle.ts\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. To check the fixes on this head without a new round, run hq review widgets 7 --fixes-only.',
  });
});

test('it says noslop judged the resolution not sound when the summary marker lists the merge as rejected', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ markerComments: { code: 0, stdout: JSON.stringify({ login: 'noslop-review[bot]', body: `<!-- noslop:summary {"checkedMerges":[],"rejectedMerges":["dddd000000000000000000000000000000000004"]} -->` }), stderr: '' }, noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 1, stdout: 'eeee000000000000000000000000000000000005\nCONFLICT (content): Merge conflict in kettle.ts\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: expect.stringContaining('dddd000 (merge). No lens has read them. This head cannot pass until those commits are answered, moved or checked. noslop judged the conflict resolution of a merge not sound'),
  });
});

test('it says noslop has not checked the resolution when the merge since the last review holds a hand edit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' }, git: { 'git rev-list --reverse --first-parent aaaa000000000000000000000000000000000001..refs/hq/pr/7': { code: 0, stdout: 'dddd000000000000000000000000000000000004\n', stderr: '' }, 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 0, stdout: 'ffff000000000000000000000000000000000006\n', stderr: '' } } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 0)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass. 1 commit(s) after the last review (aaaa000) are not accounted for: dddd000 (merge). No lens has read them. This head cannot pass until those commits are answered, moved or checked. noslop checks the conflict resolution of a merge in a fixes-only run, which has not checked this one yet: run hq review <repo> <pr> --fixes-only, and answer any finding it raises.',
  });
});

test('it gives no --fixes-only pointer when noslop has not read the head of a PR it never reviewed', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' } });

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass.',
  });
});

test('it gives no --fixes-only pointer when the only earlier review is a --fixes-only run', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ noslopCheck: { code: 1, stdout: '', stderr: 'noslop: no noslop review for this commit\n' } });
  ctx.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, 'aaaa000000000000000000000000000000000001', 'standard', 'none', '[]', NULL, 'x', 1)").run();

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({
    code: 'noslop_failed',
    message: 'noslop gave no check (exit 1: noslop: no noslop review for this commit): this is no pass.',
  });
});

test('a check records its one 1Password read for the weekly audit', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' });

  expect(ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'noslop', data: '{"consumer":"noslop","requests":1}' }]);
});

test('a check whose 1Password read is refused still records the read', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ opAnswer: { code: 1, stdout: '', stderr: 'vault not found' } });

  await expect(runNoslopCheck({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: ctx.base, clone: `${ctx.base}/noslop`, sha: 'abc1234' })).rejects.toMatchObject({ code: 'bad_config' });
  expect(ctx.db.query("SELECT actor, data FROM events WHERE subject = 'hq' AND subject_id = 'op' AND action = 'read'").all()).toStrictEqual([{ actor: 'noslop', data: '{"consumer":"noslop","requests":1}' }]);
});
