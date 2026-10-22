import { afterEach, beforeEach, expect, test } from 'bun:test';
import { toExactOptional } from '@zgeoff/std';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { allowDenyNeeded } from './allow-deny-needed.ts';
import { ALLOW_DENY_QUESTION } from './allow-deny-question.ts';
import { buildReviewStem } from './build-review-stem.ts';
import { bunCacheDir } from './bun-cache-dir.ts';
import { codexInstructions } from './codex-instructions.ts';
import { NO_TMP } from './no-tmp.ts';
import { reviewDir } from './review-dir.ts';
import { REVIEW_EFFORT } from './review-effort.ts';
import { review } from './review.ts';
import { RISK_EFFORT } from './risk-effort.ts';
import { riskTier } from './risk-tier.ts';
import { withRepoLock } from './with-repo-lock.ts';
import type { RunOpts, Runner } from '../runner/types.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(process.env['TMPDIR'] ?? '/tmp', 'hq-review-'));
  process.env['REVIEW_DIR'] = dir;
  process.env['HQ_PROJECTS'] = `${dir}/projects`;
  process.env['HQ_REPOS'] = `${dir}/repos`;
  process.env['CODEX_HOME'] = `${dir}/codex`;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env['CODEX_HOME'];
});

// The diff the fake checkout holds: by default a small gate change, so both passes run at medium.
let diffPaths = 'src/gate.ts';
let diffText = '+++ b/src/gate.ts\n+  if (!known.has(kettle)) return deny(kettle);\n';
// The PR head GitHub reports, and the commit that fetching refs/pull/<n>/head gives.
let headOid = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
let fetchedOid = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
beforeEach(() => {
  headOid = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  fetchedOid = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  diffPaths = 'src/gate.ts';
  diffText = '+++ b/src/gate.ts\n+  if (!known.has(kettle)) return deny(kettle);\n';
});

function fake(fail: string | null = null, origin = 'git@github.com:zgeoff/widgets.git'): { run: Runner; calls: { cmd: string[]; opts?: RunOpts }[] } {
  const calls: { cmd: string[]; opts?: RunOpts }[] = [];
  const run: Runner = async (cmd, opts) => {
    calls.push(toExactOptional({ cmd, opts }));
    const line = cmd.join(' ');
    if (fail && line.startsWith(fail)) return { code: 1, stdout: '', stderr: 'boom' };
    if (line === 'git remote get-url origin') return { code: 0, stdout: `${origin}\n`, stderr: '' };
    if (line === 'git diff --name-only origin/main...HEAD') return { code: 0, stdout: `${diffPaths}\n`, stderr: '' };
    if (line === 'git diff origin/main...HEAD') return { code: 0, stdout: diffText, stderr: '' };
    if (line.includes('--json headRefName,headRefOid,baseRefName')) return { code: 0, stdout: `{"headRefName":"feat","headRefOid":"${headOid}","baseRefName":"main"}`, stderr: '' };
    if (line === 'git rev-parse FETCH_HEAD') return { code: 0, stdout: `${fetchedOid}\n`, stderr: '' };
    if (cmd[0] === 'codex' && opts?.stdoutFile) await Bun.write(opts.stdoutFile, 'thinking\nline a\nline b\nNo findings.\n');
    if (cmd[0] === 'codex' && cmd[1] === 'exec') await Bun.write(cmd[cmd.indexOf('-o') + 1]!, 'src/gate.ts:12 denies an unknown input; test/hostile.ts holds its table.\n');
    if (line.includes('--json name,state,bucket')) return { code: 0, stdout: '[{"name":"test","state":"SUCCESS","bucket":"pass"},{"name":"lint","state":"FAILURE","bucket":"fail"}]', stderr: '' };
    if (cmd[1] === 'api') return { code: 0, stdout: '2\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('reviews in a worktree, removes it, and reports checks and threads', async () => {
  const { run, calls } = fake();
  const r = await review(run, 'widgets', 7, { watch: true });
  expect(r).toMatchObject({ head: 'feat', base: 'main', codexCode: 0, openThreads: 2, codexTail: 'line a\nline b\nNo findings.' });
  expect(r.checks).toHaveLength(2);
  const lines = calls.map((c) => c.cmd.join(' '));
  const add = lines.findIndex((l) => l.startsWith('git worktree add'));
  const codex = lines.findIndex((l) => l.startsWith('codex review') && l.endsWith('--base origin/main'));
  const remove = lines.findIndex((l) => l.startsWith('git worktree remove --force'));
  expect(add).toBeLessThan(codex);
  expect(codex).toBeLessThan(remove);
  expect(calls[codex]!.opts?.cwd).toBe(`${dir}/widgets7`);
  expect(lines.some((l) => l.includes('--watch'))).toBe(true);
});

test('the worktree is removed even when codex fails', async () => {
  const { run, calls } = fake('codex');
  const r = await review(run, 'widgets', 7, { watch: false });
  expect(r.codexCode).toBe(1);
  expect(calls.some((c) => c.cmd.join(' ').startsWith('git worktree remove'))).toBe(true);
  expect(calls.some((c) => c.cmd.includes('--watch'))).toBe(false);
});

test('refuses odd repo names and stops when the PR cannot be read', async () => {
  await expect(review(fake().run, '../etc', 1, { watch: false })).rejects.toThrow('owner/repo');
  await expect(review(fake().run, 'a/b/c', 1, { watch: false })).rejects.toThrow('owner/repo');
  await expect(review(fake('gh pr view').run, 'widgets', 7, { watch: false })).rejects.toThrow('gh pr view');
});

test('uses ~/projects/<repo> when its origin is the repo', async () => {
  mkdirSync(`${dir}/projects/widgets`, { recursive: true });
  const { run, calls } = fake();
  await review(run, 'zgeoff/widgets', 7, { watch: false });
  expect(calls.find((c) => c.cmd.join(' ') === 'git fetch -q origin')!.opts?.cwd).toBe(`${dir}/projects/widgets`);
  expect(calls.some((c) => c.cmd[1] === 'repo')).toBe(false);
});

test('clones into hq\'s own cache when there is no matching checkout', async () => {
  mkdirSync(`${dir}/projects/widgets`, { recursive: true });
  const { run, calls } = fake(null, 'https://github.com/someone-else/widgets');
  await review(run, 'widgets', 7, { watch: false });
  const lines = calls.map((c) => c.cmd.join(' '));
  expect(lines).toContain(`gh repo clone zgeoff/widgets ${dir}/repos/zgeoff/widgets -- -q`);
  expect(calls.find((c) => c.cmd.join(' ') === 'git fetch -q origin')!.opts?.cwd).toBe(`${dir}/repos/zgeoff/widgets`);
});

test('--repo-dir must exist and be a checkout of the repo', async () => {
  await expect(review(fake().run, 'widgets', 7, { watch: false, repoDir: `${dir}/nope` })).rejects.toThrow('does not exist');
  mkdirSync(`${dir}/elsewhere`);
  await expect(review(fake(null, 'https://github.com/zgeoff/gadgets.git').run, 'widgets', 7, { watch: false, repoDir: `${dir}/elsewhere` })).rejects.toThrow('not a checkout of zgeoff/widgets');
  const { run, calls } = fake(null, 'https://github.com/zgeoff/widgets.git');
  await review(run, 'widgets', 7, { watch: false, repoDir: `${dir}/elsewhere` });
  expect(calls.find((c) => c.cmd.join(' ') === 'git fetch -q origin')!.opts?.cwd).toBe(`${dir}/elsewhere`);
});

test('a second, read-only Codex pass asks the allow-or-deny question and its answer joins the review file', async () => {
  const { run, calls } = fake();
  const r = await review(run, 'widgets', 7, { watch: false });
  const lines = calls.map((c) => c.cmd.join(' '));
  const exec = calls.findIndex((c) => c.cmd[0] === 'codex' && c.cmd[1] === 'exec');
  expect(calls[exec]!.cmd.slice(0, 4)).toEqual(['codex', 'exec', '-s', 'read-only']);
  expect(calls[exec]!.cmd.at(-1)).toContain(ALLOW_DENY_QUESTION);
  expect(calls[exec]!.cmd.at(-1)).toContain('git diff origin/main...HEAD');
  expect(calls[exec]!.opts?.cwd).toBe(`${dir}/widgets7`);
  expect(exec).toBeLessThan(lines.findIndex((l) => l.startsWith('git worktree remove')));
  expect(r.allowDeny).toEqual({ code: 0, answer: 'src/gate.ts:12 denies an unknown input; test/hostile.ts holds its table.', skipped: null });
  const file = await Bun.file(r.reviewFile).text();
  expect(file).toContain('No findings.');
  expect(file).toContain(`## Allow-or-deny\n\n${ALLOW_DENY_QUESTION}\n\nsrc/gate.ts:12`);
});

test('a failed allow-or-deny pass is reported, not fatal', async () => {
  const { run } = fake('codex exec');
  const r = await review(run, 'widgets', 7, { watch: false });
  expect(r.codexCode).toBe(0);
  expect(r.allowDeny).toEqual({ code: 1, answer: '(no answer; codex exit 1)', skipped: null });
});

test('both Codex passes run with TMPDIR in the review\'s own folder, told to leave /tmp alone, and the folder goes after', async () => {
  for (const fail of [null, 'codex']) {
    const seen: boolean[] = [];
    const { run: base, calls } = fake(fail);
    const run: Runner = async (cmd, opts) => {
      if (cmd[0] === 'codex') {
        seen.push(existsSync(opts?.env?.['TMPDIR'] ?? ''));
      }
      return base(cmd, opts);
    };
    await review(run, 'widgets', 7, { watch: false });
    const passes = calls.filter((c) => c.cmd[0] === 'codex');
    expect(passes).toHaveLength(2);
    for (const c of passes) {
      expect(c.opts?.env?.['TMPDIR']).toBe(`${dir}/widgets7-tmp`);
      expect(c.opts?.env?.['ATC_SESSION_ID']).toBeUndefined();
      expect(c.cmd).toContain(`developer_instructions=${JSON.stringify(NO_TMP)}`);
    }
    expect(seen).toEqual([true, true]);
    expect(existsSync(`${dir}/widgets7-tmp`)).toBe(false);
  }
  expect(NO_TMP).toContain('never set BUN_INSTALL_CACHE_DIR or BUN_TMPDIR, and make no folder in /tmp');
});

test('the default review folder is on disk, not in /tmp', () => {
  const saved = process.env['REVIEW_DIR'];
  delete process.env['REVIEW_DIR'];
  try {
    expect(reviewDir()).toBe(`${process.env['HOME']}/.local/share/z-sessions/reviews`);
  } finally {
    process.env['REVIEW_DIR'] = saved;
  }
});

test('the sentence is added to the developer instructions in the Codex config, or stands alone when there are none', async () => {
  expect(await codexInstructions()).toBe(NO_TMP); // no config file
  mkdirSync(`${dir}/codex`);
  await Bun.write(`${dir}/codex/config.toml`, 'model = "m"\n');
  expect(await codexInstructions()).toBe(NO_TMP);
  await Bun.write(`${dir}/codex/config.toml`, 'not = [toml\n');
  expect(await codexInstructions()).toBe(NO_TMP);
  await Bun.write(`${dir}/codex/config.toml`, "model = \"m\"\ndeveloper_instructions = '''\nWrite short \"plain\" answers.\nNo tables.\n'''\n");
  const both = await codexInstructions();
  expect(both).toBe(`Write short "plain" answers.\nNo tables.\n\n${NO_TMP}`);
  const { run, calls } = fake();
  await review(run, 'widgets', 7, { watch: false });
  for (const c of calls.filter((x) => x.cmd[0] === 'codex')) {
    const arg = c.cmd[c.cmd.indexOf('-c') + 1]!;
    expect(Bun.TOML.parse(arg)).toEqual({ developer_instructions: both });
  }
});

test('both passes run at the review effort; the review pass may write Bun\'s install cache', async () => {
  const { run, calls } = fake();
  await review(run, 'widgets', 7, { watch: false });
  const [rev, ex] = calls.filter((c) => c.cmd[0] === 'codex');
  for (const c of [rev!, ex!]) expect(c.cmd).toContain(`model_reasoning_effort=${REVIEW_EFFORT}`);
  expect(REVIEW_EFFORT).toBe('medium');
  expect(rev!.cmd).toContain(`sandbox_workspace_write.writable_roots=${JSON.stringify([bunCacheDir()])}`);
  expect(ex!.cmd.slice(0, 4)).toEqual(['codex', 'exec', '-s', 'read-only']); // the allow-or-deny pass stays read-only
});

test('a Codex usage limit or an interrupted review fails loudly: no review is never a pass', async () => {
  for (const said of ['thinking\nERROR: You\u2019ve hit your usage limit. Try again later.\n', 'codex\nReview was interrupted. Please re-run /review.\n']) {
    const { run: base, calls } = fake();
    const run: Runner = async (cmd, opts) => {
      if (cmd[0] === 'codex' && opts?.stdoutFile) {
        calls.push(toExactOptional({ cmd, opts }));
        await Bun.write(opts.stdoutFile, said);
        return { code: 0, stdout: '', stderr: '' };
      }
      return base(cmd, opts);
    };
    await expect(review(run, 'widgets', 7, { watch: false })).rejects.toThrow('this is no review, not a pass');
    expect(calls.some((c) => c.cmd[0] === 'codex' && c.cmd[1] === 'exec')).toBe(false);
    expect(calls.some((c) => c.cmd.join(' ').startsWith('git worktree remove'))).toBe(true);
  }
});

test('a real review that quotes the limit words in a diff or a finding still passes', async () => {
  const said = "+export const X = /usage limit|Review was interrupted/;\n  'ERROR: You\u2019ve hit your usage limit'\n- [P2] Review was interrupted text matches — src/a.ts:1\nNo other findings.\n";
  const { run: base, calls } = fake();
  const run: Runner = async (cmd, opts) => {
    if (cmd[0] === 'codex' && opts?.stdoutFile) {
      await Bun.write(opts.stdoutFile, said);
      return { code: 0, stdout: '', stderr: '' };
    }
    return base(cmd, opts);
  };
  expect((await review(run, 'widgets', 7, { watch: false })).codexCode).toBe(0);
  expect(calls.some((c) => c.cmd[0] === 'codex' && c.cmd[1] === 'exec')).toBe(true);
});

test('the repo lock lets one holder in at a time, and takes over a stale lock', async () => {
  const order: string[] = [];
  const hold = (tag: string) => withRepoLock(dir, 'zgeoff/widgets', async () => {
    order.push(`${tag} in`);
    await Bun.sleep(30);
    order.push(`${tag} out`);
  });
  await Promise.all([hold('a'), hold('b')]);
  expect(order).toEqual(['a in', 'a out', 'b in', 'b out']);
  // A lock left by a dead review, older than 10 minutes, is taken over.
  const { mkdirSync: mk, utimesSync } = await import('node:fs');
  mk(`${dir}/.lock-zgeoff-widgets`);
  const old = new Date(Date.now() - 11 * 60_000);
  utimesSync(`${dir}/.lock-zgeoff-widgets`, old, old);
  expect(await withRepoLock(dir, 'zgeoff/widgets', async () => 'got it')).toBe('got it');
});

test('effort by risk: high for auth, secrets, money, migrations, deletion or infra permissions; medium otherwise', () => {
  expect(riskTier(['src/kettle.ts'], '+const spout = 3;\n')).toEqual({ effort: REVIEW_EFFORT, reason: 'no risk match in paths or diff' });
  const cases: [string[], string, string][] = [
    [['src/auth/session.ts'], '+x\n', 'auth or secrets: path src/auth/session.ts'],
    [['src/kettle.ts'], '+const k = process.env.OP_SERVICE_ACCOUNT_TOKEN;\n', 'auth or secrets: diff has "OP_SERVICE_ACCOUNT_TOKEN"'],
    [['src/billing.ts'], '+x\n', 'money: path src/billing.ts'],
    [['migrations/0004.sql'], '+x\n', 'migrations: path migrations/0004.sql'],
    [['src/kettle.ts'], "+db.query('DELETE FROM kettles');\n", 'deletion: diff has "DELETE FROM"'],
    [['src/kettle.ts'], '-  chmod 600 kettle\n', 'infra permissions: diff has "chmod"'],
    [['.github/workflows/ci.yml'], '+x\n', 'infra permissions: path .github/workflows/ci.yml'],
  ];
  for (const [paths, diff, reason] of cases) expect(riskTier(paths, diff)).toEqual({ effort: RISK_EFFORT, reason });
  // A file header that names a risky word is not a changed line.
  expect(riskTier(['src/kettle.ts'], '--- a/src/kettle.ts\n+++ b/src/kettle.ts\n context DELETE FROM\n+const spout = 3;\n').effort).toBe(REVIEW_EFFORT);
});

test('the allow-or-deny pass runs for a gate change, is skipped otherwise, and runs when the diff cannot be read', () => {
  expect(allowDenyNeeded(['src/kettle.ts'], '+const spout = 3;\n')).toEqual({ run: false, reason: 'no permission, rule, grant, allowlist, denylist or policy change in the diff' });
  expect(allowDenyNeeded(['src/policy.ts'], '+x\n').run).toBe(true);
  expect(allowDenyNeeded(['src/kettle.ts'], '+const ALLOWLIST = new Set();\n')).toEqual({ run: true, reason: 'diff has "ALLOWLIST"' });
  expect(allowDenyNeeded(['src/kettle.ts'], '-  if (isKettleAllowed(k)) return;\n').run).toBe(true);
  expect(allowDenyNeeded(null, null)).toEqual({ run: true, reason: 'the diff could not be read' });
});

test('a plain diff runs the review at medium and skips the allow-or-deny pass, saying why', async () => {
  diffPaths = 'src/kettle.ts';
  diffText = '+++ b/src/kettle.ts\n+const spout = 3;\n';
  const { run, calls } = fake();
  const r = await review(run, 'widgets', 7, { watch: false });
  const codex = calls.filter((c) => c.cmd[0] === 'codex');
  expect(codex.map((c) => c.cmd[1])).toEqual(['review']);
  expect(codex[0]!.cmd).toContain(`model_reasoning_effort=${REVIEW_EFFORT}`);
  expect(r.effort).toEqual({ effort: REVIEW_EFFORT, reason: 'no risk match in paths or diff', forced: false });
  expect(r.allowDeny).toEqual({ code: null, answer: 'allow-or-deny pass skipped: no permission, rule, grant, allowlist, denylist or policy change in the diff', skipped: 'no permission, rule, grant, allowlist, denylist or policy change in the diff' });
  expect(await Bun.file(r.reviewFile).text()).toContain('## Effort\n\nmedium (no risk match in paths or diff)');
});

test('a risky diff runs both passes at high; --effort overrides the tier and says what risk chose', async () => {
  diffPaths = 'src/grants.ts';
  diffText = "+++ b/src/grants.ts\n+db.query('DELETE FROM grants');\n";
  let { run, calls } = fake();
  let r = await review(run, 'widgets', 7, { watch: false });
  for (const c of calls.filter((x) => x.cmd[0] === 'codex')) expect(c.cmd).toContain(`model_reasoning_effort=${RISK_EFFORT}`);
  expect(calls.filter((x) => x.cmd[0] === 'codex').length).toBe(2);
  expect(r.effort).toMatchObject({ effort: RISK_EFFORT, forced: false });
  ({ run, calls } = fake());
  r = await review(run, 'widgets', 7, { watch: false, effort: REVIEW_EFFORT });
  for (const c of calls.filter((x) => x.cmd[0] === 'codex')) expect(c.cmd).toContain(`model_reasoning_effort=${REVIEW_EFFORT}`);
  expect(r.effort.forced).toBe(true);
  expect(r.effort.reason).toStartWith('--effort medium (by risk: high, ');
  await expect(review(run, 'widgets', 7, { watch: false, effort: 'low' as never })).rejects.toThrow('--effort must be medium or high');
});

// Committed tables of hostile inputs (every allow-or-deny check has one). Each must get high effort, or must run the
// allow-or-deny pass: a diff that tries to slip past the tiering by its file name or its spelling.
const MUST_BE_HIGH: [string, string][] = [
  ['src/atc.ts', "+  auth: { scheme: 'none' },"],
  ['src/kettle.ts', '+const authorization = req.headers.get(x);'],
  ['src/kettle.ts', '-  if (!authenticated) return;'],
  ['src/kettle.ts', '+  jwt.verify(t);'],
  ['src/kettle.ts', '+const SECRETS = load();'],
  ['src/kettle.ts', '+  password: input,'],
  ['src/kettle.ts', "+await sh('rm -rf ' + d);"],
  ['src/kettle.ts', '+rmSync(dir, { recursive: true });'],
  ['src/kettle.ts', '+  const v = SCHEMA_VERSION + 1;'],
  ['src/kettle.ts', '+  permissions: write-all'],
];
const MUST_RUN_GATE: [string, string][] = [
  ['src/kettle.ts', '+const Allowlist = new Set();'],
  ['src/kettle.ts', '-  if (denied) return;'],
  ['src/kettle.ts', '+  if (!canBrew(user)) throw e;'],
  ['src/kettle.ts', '+  grants: [],'],
  ['src/kettle.ts', '+  rules.push(r);'],
  ['src/brew-policy.ts', '+x'],
];

test('every hostile input in the tables gets high effort, or runs the allow-or-deny pass', () => {
  for (const [path, line] of MUST_BE_HIGH) expect([path, line, riskTier([path], `${line}\n`).effort]).toEqual([path, line, RISK_EFFORT]);
  for (const [path, line] of MUST_RUN_GATE) expect([path, line, allowDenyNeeded([path], `${line}\n`).run]).toEqual([path, line, true]);
});

// The fake checkout, with a bun.lock in the worktree once it is added.
function buildLockedFake(fail: string | null = null): ReturnType<typeof fake> {
  const inner = fake(fail),
    runLocked: Runner = async (cmd, opts) => {
      const result = await inner.run(cmd, opts);
      if (cmd.slice(0, 3).join(' ') === 'git worktree add') {
        mkdirSync(String(cmd[5]), { recursive: true });
        await Bun.write(`${String(cmd[5])}/bun.lock`, '{}');
      }
      return result;
    };
  return { calls: inner.calls, run: runLocked };
}

test('a repo with bun.lock gets a frozen install without scripts in the worktree, before Codex runs', async () => {
  const fakeRun = buildLockedFake(),
    result = await review(fakeRun.run, 'widgets', 7, { watch: false }),
    texts = fakeRun.calls.map((c) => c.cmd.join(' ')),
    where = texts.indexOf('bun install --frozen-lockfile --ignore-scripts');
  expect(where).toBeGreaterThan(texts.findIndex((l) => l.startsWith('git worktree add')));
  expect(where).toBeLessThan(texts.findIndex((l) => l.startsWith('codex review')));
  expect(fakeRun.calls[where]?.opts?.cwd).toBe(`${dir}/widgets7`);
  expect(result.install).toEqual({ detail: 'bun install --frozen-lockfile --ignore-scripts', ok: true, ran: true });
});

test('a failed install is reported, the review still runs, and the review file says it is static', async () => {
  const result = await review(buildLockedFake('bun install').run, 'widgets', 7, { watch: false }),
    text = await Bun.file(result.reviewFile).text();
  expect(result.install.ok).toBe(false);
  expect(result.install.detail).toContain('bun install failed (1): boom');
  expect(text).toContain('FAILED: bun install failed');
});

test('a repo without bun.lock gets no install', async () => {
  const fakeRun = fake(),
    result = await review(fakeRun.run, 'widgets', 7, { watch: false });
  expect(fakeRun.calls.some((c) => c.cmd[0] === 'bun')).toBe(false);
  expect(result.install).toEqual({ detail: 'no bun.lock', ok: true, ran: false });
});

test('a review file of a zgeoff repo keeps its old name, and another owner\'s gets the owner', () => {
  expect([buildReviewStem('zgeoff', 'widgets', 7), buildReviewStem('ZGeoff', 'Widgets', 7), buildReviewStem('other', 'widgets', 7)]).toStrictEqual(['widgets7', 'widgets7', 'other-widgets7']);
});

test('it checks out the fetched PR head commit, never origin/<headRefName>, so a fork branch named like ours cannot pick our code', async () => {
  const { run, calls } = fake();
  await review(run, 'widgets', 7, { watch: false });
  const lines = calls.map((c) => c.cmd.join(' '));
  expect(lines).toContain('git fetch -q origin refs/pull/7/head');
  expect(lines.find((l) => l.startsWith('git worktree add'))).toBe(`git worktree add -q --detach ${dir}/widgets7 a1b2c3d4e5f60718293a4b5c6d7e8f9012345678`);
  expect(lines.some((l) => l.includes('origin/feat'))).toBe(false);
});

test('it refuses to review when the fetched pull ref is not the PR head GitHub reports', async () => {
  fetchedOid = '0000000000000000000000000000000000000bad';
  const { run, calls } = fake();
  await expect(review(run, 'widgets', 7, { watch: false })).rejects.toMatchObject({ code: 'head_moved' });
  expect(calls.some((c) => c.cmd.join(' ').startsWith('git worktree add'))).toBe(false);
});
