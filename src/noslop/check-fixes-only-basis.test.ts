import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { openDb } from '../db/open-db.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { checkFixesOnlyBasis } from './check-fixes-only-basis.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-basis-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });

  return {
    base,
    dir: join(base, 'work'),
    db,

    // Runs a shell script in the temp dir with no global or system git config, and gives its stdout.
    runShell: async (script: string) => {
      const result = await realRunner(['sh', '-c', script], { cwd: base, env: cleanEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Badger', GIT_AUTHOR_EMAIL: 'badger@example.test', GIT_COMMITTER_NAME: 'Badger', GIT_COMMITTER_EMAIL: 'badger@example.test' }) });
      return result.stdout.trim();
    },
    addReview: (head: string, reviewBase: string | null = null) => db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, special, findings, redesign, sha) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, ?, 'standard', 'none', '[]', NULL, 'x')").run(head, reviewBase),
  };
}

const FINDING = JSON.stringify({ id: 1, in_reply_to_id: null, body: 'Kettle never boils\n<!-- noslop:finding {"id":"00112233445566aa"} -->' });

test('it opens the basis when a clean rebase onto a moved base is followed by one fix commit a fixed answer names', async () => {
  const ctx = setupTest(),
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
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin main feat:refs/pull/7/head
echo "$lens"`),
    tip = await ctx.runShell('git -C work rev-parse feat'),
    tipRunner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${tip}` })].join('\n') });
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: tipRunner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

test('it opens the basis when the fixed answer names the pre-rebase sha of the fix commit', async () => {
  const ctx = setupTest(),
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
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git tag oldfix
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git rebase -q main
git push -q origin main feat:refs/pull/7/head
echo "$lens"`),
    oldFix = await ctx.runShell('git -C work rev-parse oldfix'),
    oldRunner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${oldFix.slice(0, 10)}` })].join('\n') });
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: oldRunner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

test('it opens the basis when a fixed answer names a fix that a second rebase rewrote', async () => {
  const ctx = setupTest(),
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
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git tag firstfix
git checkout -q main
printf 'whistle\\n' > whistle.txt
git add -A
git commit -q -m 'add whistle'
git checkout -q feat
git rebase -q main
git push -q origin main feat:refs/pull/7/head
echo "$lens"`),
    oldFix = await ctx.runShell('git -C work rev-parse firstfix'),
    oldRunner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${oldFix}` })].join('\n') });
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: oldRunner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

test('it shuts the basis when a fixed answer names a commit from before the last review with the same patch as a new commit', async () => {
  const ctx = setupTest(),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git checkout -q -b decoy
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam elsewhere'
git checkout -q main
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git rebase -q main
git cherry-pick decoy > /dev/null
git push -q origin main feat:refs/pull/7/head
echo "$lens"`),
    stray = await ctx.runShell('git -C work rev-parse decoy'),
    strayRunner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${stray}` })].join('\n') }),
    tip = await ctx.runShell('git -C work rev-parse feat');
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: strayRunner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'shut', since: lensHead, unread: [{ sha: tip, kind: 'unnamed' }] });
});

test('it refuses the mapping, naming the reviewed commit, when the rebase changed its patch', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true }),
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
printf 'scalding\\n' > kettle.txt
git commit -q -a --amend --no-edit
git push -q origin main feat:refs/pull/7/head
echo "$lens"`);
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'unmapped', since: lensHead, why: `the rebase changed the patch of the reviewed commit ${lensHead.slice(0, 7)}, or dropped it` });
});

test('it refuses the mapping when the rebase dropped a reviewed commit, naming it', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true }),
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
git tag first
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git tag second
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git checkout -q feat
git rebase -q --onto main first feat
printf 'whistle\\n' > whistle.txt
git add -A
git commit -q -m 'add whistle'
git push -q origin main feat:refs/pull/7/head
echo "$(git rev-parse second)"`),
    reviewedFirst = await ctx.runShell('git -C work rev-parse first');
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'unmapped', since: lensHead, why: `the branch drops or reorders the reviewed commit ${reviewedFirst.slice(0, 7)}, so the order does not match` });
});

test('it shuts the basis, naming the new commit, when a rebase is followed by a commit no fixed answer names', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true }),
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
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin main feat:refs/pull/7/head
echo "$lens"`),
    tip = await ctx.runShell('git -C work rev-parse feat');
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'shut', since: lensHead, unread: [{ sha: tip, kind: 'unnamed' }] });
});

test('it leaves out a reviewed commit whose patch the base already holds, in a stack whose base rebased', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true }),
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
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q main
git cherry-pick -x feat~1 > /dev/null
git checkout -q feat
git rebase -q main
git push -q origin main feat:refs/pull/7/head
echo "$lens"`);
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

test('it refuses the mapping when the repo holds no commit of the last review', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ realGit: true });
  await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
git add -A
git commit -q -m base
git push -q origin main main:refs/pull/7/head`);
  ctx.addReview('1111111111111111111111111111111111111111');

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'unmapped', since: '1111111111111111111111111111111111111111', why: 'the repo holds no commit of it' });
});

test('it cannot tell when git fails to give the patch ids of a rebased branch', async () => {
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
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: fake.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'unknown', since: lensHead, why: 'git cannot give the patch ids of 2 commit(s): fatal: patch-id broke' });
});

test('it reads the PR head it fetched when another fetch in the same clone rewrites FETCH_HEAD right after', async () => {
  const ctx = setupTest(),
    lensHead = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
printf 'shut\\n' > lid.txt
git add -A
git commit -q -m base
git push -q origin main
git fetch -q origin
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin feat:refs/pull/7/head
git checkout -q main
printf 'open\\n' > lid.txt
git commit -q -am 'open lid'
git push -q origin main
git checkout -q feat
echo "$lens"`),
    newFix = await ctx.runShell('git -C work rev-parse feat'),
    noslopFake = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${newFix}` })].join('\n') }),
    runWithRace: Runner = async (cmd, opts) => {
      const result = await noslopFake.run(cmd, opts);
      if (cmd[1] === 'fetch' && cmd.some((arg) => arg.includes('pull/7/head'))) {
        await noslopFake.run(['git', 'fetch', '-q', 'origin', 'main'], opts);
      }
      return result;
    };
  ctx.addReview(lensHead);

  await expect(checkFixesOnlyBasis({ run: runWithRace, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

// The lower PR (teapot) gains a commit after PR 7's review and squash-merges, so the base holds
// neither reviewed lower commit's patch nor its exact change. `carry` instead closes teapot and
// rebases its commits onto main as PR 7's own.
async function setupSquashedStack(ctx: ReturnType<typeof setupTest>, carry = false): Promise<{ lensHead: string; lowerHead: string; fix: string }> {
  const printed = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
git add -A
git commit -q -m base
start=$(git rev-parse HEAD)
git checkout -q -b teapot
printf 'spout\\n' > teapot.txt
git add -A
git commit -q -m spout
printf 'lid\\n' > lid.txt
git add -A
git commit -q -m lid
lower=$(git rev-parse HEAD)
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q teapot
printf 'lid and knob\\n' > lid.txt
git commit -q -am knob
git checkout -q main
${carry ? String.raw`printf 'filled\n' > kettle-note.txt && git add -A && git commit -q -m note` : "git merge -q --squash teapot > /dev/null && git commit -q -m 'teapot (#6)'"}
git checkout -q feat
git rebase -q --onto main ${carry ? '$start' : '$lower'} feat
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin main feat:refs/pull/7/head
echo "$lens $lower $(git rev-parse HEAD)"`),
    [lensHead = '', lowerHead = '', fix = ''] = printed.split(' ');
  return { lensHead, lowerHead, fix };
}

function buildFixedRunner(fix: string): ReturnType<typeof buildFakeRunner> {
  return buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${fix}` })].join('\n') });
}

test('it opens the basis when a rebase leaves out the commits of a lower layer below the base the review read', async () => {
  const ctx = setupTest(),
    heads = await setupSquashedStack(ctx),
    runner = buildFixedRunner(heads.fix);
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: heads.lensHead });
});

test('it refuses the mapping when the commits below the base the review read become the PR\'s own', async () => {
  const ctx = setupTest(),
    heads = await setupSquashedStack(ctx, true),
    runner = buildFixedRunner(heads.fix);
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toMatchObject({ kind: 'unmapped', since: heads.lensHead });
});

test('it reads the reviewed commits from today\'s base when the review recorded no base', async () => {
  const ctx = setupTest(),
    heads = await setupSquashedStack(ctx),
    runner = buildFixedRunner(heads.fix);
  ctx.addReview(heads.lensHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'unmapped', since: heads.lensHead, why: 'the branch holds 2 of the 3 reviewed commits past the base' });
});

// Two reviews of one PR, the second reading only the commits since the first, then a rebase onto a
// moved base that keeps every patch, and a fix commit; once with an empty commit among the reviewed
// ones, as a new check run makes.
test.each([
  ['no empty commit', ''],
  ['an empty commit', "git commit -q --allow-empty -m 'start a new check run'"],
])('it opens the basis when the last review read only the commits since an earlier review and a rebase kept every patch, with %s', async (_shape, emptyCommit) => {
  const ctx = setupTest();
  const printed = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
git add -A
git commit -q -m base
start=$(git rev-parse HEAD)
git checkout -q -b feat
printf 'spout\\n' > spout.txt
git add -A
git commit -q -m spout
${emptyCommit}
printf 'lid\\n' > lid.txt
git add -A
git commit -q -m lid
first=$(git rev-parse HEAD)
printf 'hot\\n' > kettle.txt
git commit -q -am boil
printf 'whistle\\n' > whistle.txt
git add -A
git commit -q -m whistle
lens=$(git rev-parse HEAD)
git checkout -q main
printf 'filled\\n' > kettle-note.txt
git add -A
git commit -q -m note
git checkout -q feat
git rebase -q --empty=keep main
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin main feat:refs/pull/7/head
echo "$first $start $lens $(git rev-parse HEAD)"`);
  const [firstHead = '', firstBase = '', lensHead = '', fix = ''] = printed.split(' ');
  const runner = buildFixedRunner(fix);
  ctx.addReview(firstHead, firstBase);
  ctx.addReview(lensHead, firstHead);

  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- FixesOnlyBasisInput keeps `dir` until GEO-1624 deletes the fixes-only basis
  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: lensHead });
});

async function setupMergedLower(ctx: ReturnType<typeof setupTest>, resolve: boolean): Promise<{ lensHead: string; later: string; squash: string }> {
  const printed = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
git add -A
git commit -q -m base
git checkout -q -b teapot
printf 'spout\\n' > teapot.txt
git add -A
git commit -q -m spout
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
${resolve ? String.raw`printf 'spout and steam\n' > teapot.txt` : 'true'}
git commit -q -am boil
lens=$(git rev-parse HEAD)
git checkout -q teapot
printf 'spout and lid\\n' > teapot.txt
git commit -q -am 'teapot lid'
later=$(git rev-parse HEAD)
git checkout -q main
git merge -q --squash teapot > /dev/null
git commit -q -m 'teapot (#6)'
squash=$(git rev-parse HEAD)
git checkout -q feat
git merge -q --no-ff --no-edit teapot > /dev/null 2>&1 || { printf 'spout, lid and steam\\n' > teapot.txt; git commit -q -am 'merge teapot'; }
git push -q origin main feat:refs/pull/7/head
echo "$lens $later $squash"`),
    [lensHead = '', later = '', squash = ''] = printed.split(' ');
  return { lensHead, later, squash };
}

function buildMergedPulls(squash: string): string {
  return JSON.stringify([{ number: 6, merged_at: '2026-10-20T00:00:00Z', merge_commit_sha: squash, base: { ref: 'main' } }]);
}

test('it opens the basis for a clean merge of a commit of a PR that squash-merged into the base', async () => {
  const ctx = setupTest(),
    heads = await setupMergedLower(ctx, false),
    runner = buildFakeRunner({ realGit: true, commitPulls: { [heads.later]: buildMergedPulls(heads.squash) } });
  ctx.addReview(heads.lensHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: heads.lensHead });
});

test('it shuts the basis on a merge with a resolution of a commit of a PR that squash-merged into the base', async () => {
  const ctx = setupTest(),
    heads = await setupMergedLower(ctx, true),
    merge = await ctx.runShell('git -C work rev-parse feat'),
    runner = buildFakeRunner({ realGit: true, commitPulls: { [heads.later]: buildMergedPulls(heads.squash) } });
  ctx.addReview(heads.lensHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'shut', since: heads.lensHead, unread: [{ sha: merge, kind: 'unclean-merge' }] });
});

test.each([
  ['fails', { code: 1, stdout: '', stderr: 'invented: HTTP 502' }],
  ['answers no list', { code: 0, stdout: '{"message":"invented"}', stderr: '' }],
])('it cannot tell when GitHub %s for the PRs that hold a merged commit', async (_label, answer) => {
  const ctx = setupTest(),
    heads = await setupMergedLower(ctx, false),
    runner = buildFakeRunner({ realGit: true, commitPulls: { [heads.later]: answer } });
  ctx.addReview(heads.lensHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toMatchObject({ kind: 'unknown', since: heads.lensHead, why: expect.stringContaining(`gh cannot list the PRs that hold ${heads.later.slice(0, 7)}`) });
});

// PR 7 (feat) was reviewed on top of PR 6 (teapot), then retargeted to main with no rebase, and
// added one fix. `land` says how teapot reached main: never, by squash, or by a merge commit.
async function setupRetargeted(ctx: ReturnType<typeof setupTest>, land: 'none' | 'squash' | 'merge', advance = false): Promise<{ lensHead: string; lowerHead: string; lower: string[]; squash: string; fix: string }> {
  const landing = { none: 'true', squash: "git merge -q --squash teapot > /dev/null && git commit -q -m 'teapot (#6)'", merge: "git merge -q --no-ff --no-edit teapot" }[land],
    printed = await ctx.runShell(`set -e
git init -q --bare -b main remote.git
git init -q -b main work
cd work
git remote add origin "$(cd .. && pwd)/remote.git"
printf 'cold\\n' > kettle.txt
git add -A
git commit -q -m base
git checkout -q -b teapot
printf 'spout\\n' > teapot.txt
git add -A
git commit -q -m spout
first=$(git rev-parse HEAD)
printf 'lid\\n' > lid.txt
git add -A
git commit -q -m lid
lower=$(git rev-parse HEAD)
lid=$lower
git checkout -q -b feat
printf 'hot\\n' > kettle.txt
git commit -q -am boil
lens=$(git rev-parse HEAD)
${advance ? String.raw`git checkout -q teapot && printf 'lid and knob\n' > lid.txt && git commit -q -am knob && lower=$(git rev-parse HEAD)` : 'true'}
git checkout -q main
${landing}
squash=$(git rev-parse HEAD)
git checkout -q feat
printf 'steam\\n' > steam.txt
git add -A
git commit -q -m 'add steam'
git push -q origin main feat:refs/pull/7/head
echo "$lens $lower $first $lid $squash $(git rev-parse HEAD)"`),
    [lensHead = '', lowerHead = '', first = '', lid = '', squash = '', fix = ''] = printed.split(' ');
  return { lensHead, lowerHead, lower: [first, lid], squash, fix };
}

test('it shuts the basis on the commits below the base the review read when a lower PR that never merged stays on the branch', async () => {
  const ctx = setupTest(),
    heads = await setupRetargeted(ctx, 'none'),
    lapsed = JSON.stringify([{ number: 6, merged_at: null, merge_commit_sha: null, base: { ref: 'main' } }]),
    runner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${heads.fix}` })].join('\n'), commitPulls: Object.fromEntries(heads.lower.map((sha) => [sha, lapsed])) });
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'shut', since: heads.lensHead, unread: heads.lower.map((sha) => ({ sha, kind: 'unreviewed' })) });
});

test('it opens the basis when the commits below the base the review read belong to a lower PR that squash-merged into the base', async () => {
  const ctx = setupTest(),
    heads = await setupRetargeted(ctx, 'squash'),
    landed = JSON.stringify([{ number: 6, merged_at: '2026-10-20T00:00:00Z', merge_commit_sha: heads.squash, base: { ref: 'main' } }]),
    runner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${heads.fix}` })].join('\n'), commitPulls: Object.fromEntries(heads.lower.map((sha) => [sha, landed])) });
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: heads.lensHead });
});

test('it opens the basis without asking GitHub when a merge commit put the lower PR in the base', async () => {
  const ctx = setupTest(),
    heads = await setupRetargeted(ctx, 'merge'),
    runner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${heads.fix}` })].join('\n') });
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'open', since: heads.lensHead });
  expect(runner.lines().filter((line) => line.includes('/commits/'))).toStrictEqual([]);
});

test('it leaves out the commits of a lower branch that moved on after the PR forked from it', async () => {
  const ctx = setupTest(),
    heads = await setupRetargeted(ctx, 'none', true),
    lapsed = JSON.stringify([{ number: 6, merged_at: null, merge_commit_sha: null, base: { ref: 'main' } }]),
    runner = buildFakeRunner({ realGit: true, reviewComments: [FINDING, JSON.stringify({ id: 2, in_reply_to_id: 1, body: `fixed ${heads.fix}` })].join('\n'), commitPulls: Object.fromEntries([...heads.lower, heads.lowerHead].map((sha) => [sha, lapsed])) });
  ctx.addReview(heads.lensHead, heads.lowerHead);

  await expect(checkFixesOnlyBasis({ run: runner.run, db: ctx.db, slug: 'zgeoff/widgets', repo: 'widgets', pr: 7, dir: join(ctx.base, 'work') })).resolves.toStrictEqual({ kind: 'shut', since: heads.lensHead, unread: heads.lower.map((sha) => ({ sha, kind: 'unreviewed' })) });
});
