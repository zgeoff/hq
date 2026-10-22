// hq review <repo> <pr>: a Codex review of the PR head against its base, in a
// throwaway worktree, then CI checks and the count of open review threads.
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { allowDenyNeeded } from './allow-deny-needed.ts';
import { ALLOW_DENY_QUESTION } from './allow-deny-question.ts';
import { buildReviewStem } from './build-review-stem.ts';
import { bunCacheDir } from './bun-cache-dir.ts';
import { checkout } from './checkout.ts';
import { CODEX_UNAVAILABLE } from './codex-unavailable.ts';
import { codexInstructions } from './codex-instructions.ts';
import { NO_ALLOW_DENY } from './no-allow-deny.ts';
import { parseRepo } from './parse-repo.ts';
import { readCIState } from './read-ci-state.ts';
import { REVIEW_EFFORT } from './review-effort.ts';
import { reviewDir } from './review-dir.ts';
import { RISK_EFFORT } from './risk-effort.ts';
import { riskTier } from './risk-tier.ts';
import { runCommand as must } from './run-command.ts';
import { runInstall } from './run-install.ts';
import type { Effort, ReviewResult } from './types.ts';
import { withRepoLock } from './with-repo-lock.ts';

export async function review(run: Runner, rawRepo: string, pr: number, opts: { watch: boolean; owner?: string; repoDir?: string; effort?: Effort }): Promise<ReviewResult> {
  if (opts.effort !== undefined && opts.effort !== REVIEW_EFFORT && opts.effort !== RISK_EFFORT) throw new HqError('bad_args', `--effort must be ${REVIEW_EFFORT} or ${RISK_EFFORT}`);
  const answerFile = buildReviewPath(rawRepo, opts.owner, pr, '-allow-deny.md'),
    reviewFile = buildReviewPath(rawRepo, opts.owner, pr, '-review.md'),
    tmp = buildReviewPath(rawRepo, opts.owner, pr, '-tmp'),
    wt = buildReviewPath(rawRepo, opts.owner, pr, '');
  const { owner, repo } = parseRepo(rawRepo, opts.owner ?? 'zgeoff');
  if (!Number.isInteger(pr) || pr <= 0) throw new HqError('bad_args', 'pr must be a positive number');
  const slug = `${owner}/${repo}`;
  const dir = await checkout(run, slug, repo, opts.repoDir);
  const S = reviewDir();
  mkdirSync(dirname(wt), { recursive: true });

  const refs = JSON.parse(await must(run, ['gh', 'pr', 'view', String(pr), '-R', slug, '--json', 'headRefName,headRefOid,baseRefName'])) as { headRefName: string; headRefOid: string; baseRefName: string };
  const head = refs.headRefName;
  const base = refs.baseRefName;
  // A fork's branch can share a name with one of origin's, so origin/<headRefName> may not be the PR's code.
  await withRepoLock(S, slug, async () => {
    await must(run, ['git', 'fetch', '-q', 'origin'], dir);
    await must(run, ['git', 'fetch', '-q', 'origin', `refs/pull/${pr}/head`], dir);
    const fetched = await must(run, ['git', 'rev-parse', 'FETCH_HEAD'], dir);
    if (fetched !== refs.headRefOid) throw new HqError('head_moved', `refs/pull/${pr}/head is ${fetched}, but the PR head is ${refs.headRefOid}; try again`);
  });
  let allowDenyCode: number | null = null,
    codexCode: number,
    gate: { run: boolean; reason: string },
    install: ReviewResult['install'] = { ran: false, ok: true, detail: 'no install' },
    tier: ReviewResult['effort'];
  rmSync(wt, { recursive: true, force: true });
  await withRepoLock(S, slug, async () => {
    await run(['git', 'worktree', 'prune'], { cwd: dir });
    await must(run, ['git', 'worktree', 'add', '-q', '--detach', wt, refs.headRefOid], dir);
  });
  try {
    rmSync(reviewFile, { force: true });
    rmSync(answerFile, { force: true });
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const env = cleanEnv({ TMPDIR: tmp });
    install = await runInstall(run, wt, env);
    const names = await run(['git', 'diff', '--name-only', `origin/${base}...HEAD`], { cwd: wt });
    const patch = await run(['git', 'diff', `origin/${base}...HEAD`], { cwd: wt });
    const paths = names.code === 0 ? names.stdout.split('\n').filter(Boolean) : null;
    const diff = patch.code === 0 ? patch.stdout : null;
    const auto: { effort: Effort; reason: string } = paths && diff !== null ? riskTier(paths, diff) : { effort: RISK_EFFORT, reason: 'the diff could not be read' };
    tier = opts.effort ? { effort: opts.effort, reason: `--effort ${opts.effort} (by risk: ${auto.effort}, ${auto.reason})`, forced: true } : { ...auto, forced: false };
    gate = allowDenyNeeded(paths, diff);
    const NO_TMP_ARGS = ['-c', `developer_instructions=${tomlString(await codexInstructions())}`, '-c', `model_reasoning_effort=${tier.effort}`];
    const CACHE_ARGS = ['-c', `sandbox_workspace_write.writable_roots=${JSON.stringify([bunCacheDir()])}`];
    codexCode = (await run(['codex', 'review', ...NO_TMP_ARGS, ...CACHE_ARGS, '--base', `origin/${base}`], { cwd: wt, env, stdoutFile: reviewFile })).code;
    const said = await Bun.file(reviewFile).text().catch(() => '');
    const m = CODEX_UNAVAILABLE.exec(said);
    if (m) throw new HqError('codex_unavailable', `codex gave no review ("${m[0]}"): this is no review, not a pass. Use another reviewer. Codex output: ${reviewFile}`);
    if (gate.run) allowDenyCode = (await run(['codex', 'exec', '-s', 'read-only', ...NO_TMP_ARGS, '-o', answerFile, allowDenyPacket(base)], { cwd: wt, env })).code;
  } finally {
    await withRepoLock(S, slug, () => run(['git', 'worktree', 'remove', '--force', wt], { cwd: dir }));
    rmSync(tmp, { recursive: true, force: true });
  }
  const text = await Bun.file(reviewFile).text().catch(() => '');
  const codexTail = text.trimEnd().split('\n').slice(-3).join('\n');
  const skipped = gate.run ? null : gate.reason;
  const answer = skipped ? `allow-or-deny pass skipped: ${skipped}` : (await Bun.file(answerFile).text().catch(() => '')).trim() || `(no answer; codex exit ${allowDenyCode})`;
  appendFileSync(reviewFile, `\n\n## Install\n\n${install.ok ? install.detail : `FAILED: ${install.detail}. Codex could not run the repo's tests; treat this review as static.`}\n`);
  appendFileSync(reviewFile, `\n\n## Effort\n\n${tier.effort} (${tier.reason})\n\n## Allow-or-deny\n\n${ALLOW_DENY_QUESTION}\n\n${answer}\n`);
  rmSync(answerFile, { force: true });

  return { repo, pr, head, base, reviewFile, codexCode, codexTail, effort: tier, allowDeny: { code: allowDenyCode, answer, skipped }, ...(await readCIState(run, slug, pr, opts.watch)), install };
}

// A TOML basic string: JSON's escapes are all valid TOML; DEL is the one control JSON leaves raw.
const tomlString = (s: string) => JSON.stringify(s).replace(/\x7f/g, '\\u007F');

function allowDenyPacket(base: string): string {
  return [
    `Answer one question about the diff \`git diff origin/${base}...HEAD\` in this directory. Read only; change no file.`,
    `Question: ${ALLOW_DENY_QUESTION}`,
    'For each allow-or-deny check the diff adds or changes (an allowlist, a denylist, a permission or auth check, an input filter or validator), give its file:line, say whether an unknown input is allowed or denied, and name the committed table of hostile inputs it must refuse, or say none exists.',
    `If the diff adds or changes no allow-or-deny check, answer exactly: ${NO_ALLOW_DENY}`,
  ].join('\n');
}

function buildReviewPath(rawRepo: string, rawOwner: string | undefined, pr: number, suffix: string): string {
  const parsed = parseRepo(rawRepo, rawOwner ?? 'zgeoff');
  return `${reviewDir()}/${buildReviewStem(parsed.owner, parsed.repo, pr)}${suffix}`;
}
