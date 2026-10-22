import type { Database } from 'bun:sqlite';
import { recordOpRead } from '../one-password/record-op-read.ts';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { match } from 'ts-pattern';
import { buildFailure } from './build-failure.ts';
import { checkFixesOnlyBasis } from './check-fixes-only-basis.ts';
import type { FixesOnlyBasis } from './check-fixes-only-basis.ts';
import { findFetchedHead } from './find-fetched-head.ts';
import { findFixesOnlyRefusal } from './find-fixes-only-refusal.ts';
import { isNoReviewRefusal } from './is-no-review-refusal.ts';
import { NoslopCheckError } from './noslop-check-error.ts';
import { formatUnmappedHead } from './format-unmapped-head.ts';
import { formatUnreadCommits } from './format-unread-commits.ts';
import { buildNoslopCommand } from './build-noslop-command.ts';
import { buildNoslopEnv } from './build-noslop-env.ts';
import { getTail } from './get-tail.ts';
import { loadNoslopSecrets } from './load-noslop-secrets.ts';
import type { NoslopSecrets } from './load-noslop-secrets.ts';
import type { CheckOutput, OpenFinding } from './parse-check-run.ts';
import { parseCheckRun } from './parse-check-run.ts';
import { pickAction } from './pick-action.ts';
import { recordRound } from './record-round.ts';
import type { RoundRow } from './record-round.ts';
import type { Judged } from './types.ts';

export interface NoslopCheckContext {
  run: Runner;
  db: Database;
  slug: string;
  repo: string;
  pr: number;

  // A checkout of the repo: noslop reads its config from there.
  dir: string;
  clone: string;
  sha: string;
}

export interface NoslopCheckResult {
  repo: string;
  pr: number;
  conclusion: 'success' | 'failure';
  title: string;
  summary: string;
  open: OpenFinding[];
  ms: number;
  sha: string;
}

// `noslop check` on the PR: records the outcome and returns it. Success and failure both exit 0.
export async function runNoslopCheck(ctx: NoslopCheckContext): Promise<NoslopCheckResult> {
  const checked = await runNoslopCheckProcess(ctx),
    row = buildCheckRow(ctx, checked);
  recordRound(ctx.db, row);
  logEvent(ctx.db, 'hq', `noslop:${ctx.repo}#${ctx.pr}`, pickAction('check', row.ok), 'hq', null, null, { ms: checked.ms, conclusion: row.conclusion, sha: checked.sha });
  if (checked.judged.value === null) {
    const basis = await tryCheckUnreadHead(ctx, checked.judged.why),
      refused = basis.kind === 'open' ? await findHeadRefusal(ctx) : null;
    throw buildCheckFailure(checked, formatFixesOnlyHint(ctx, basis, refused));
  }
  return { repo: ctx.repo, pr: ctx.pr, conclusion: checked.judged.value.conclusion, title: checked.judged.value.title, summary: checked.judged.value.summary, open: checked.judged.value.open, ms: checked.ms, sha: checked.sha };
}

interface CheckRan {
  judged: Judged<CheckOutput>;
  ms: number;
  startedAt: string;
  sha: string;
}

async function runNoslopCheckProcess(ctx: NoslopCheckContext): Promise<CheckRan> {
  const secrets = await loadNoslopSecrets(ctx.run, () => recordOpRead(ctx.db, 'noslop', 1));
  return await runNoslopCheckWithSecrets(ctx, secrets);
}

const CHECK_TIMEOUT_MS = 300_000;

async function runNoslopCheckWithSecrets(ctx: NoslopCheckContext, secrets: NoslopSecrets): Promise<CheckRan> {
  const args = ['check', '--pr', String(ctx.pr), '--repo', ctx.slug, '--json'],
    began = Date.now(),
    begun = iso(now()),
    proc = await boundedRunner(ctx.run, CHECK_TIMEOUT_MS)(buildNoslopCommand(ctx.clone, args), { cwd: ctx.dir, env: buildNoslopEnv(secrets) });
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- grandfathered property of the recorded round
  return { judged: parseCheckRun(proc.code, proc.stdout, getTail(proc.stderr, secrets), CHECK_TIMEOUT_MS), ms: Date.now() - began, startedAt: begun, sha: ctx.sha };
}

function buildCheckRow(ctx: NoslopCheckContext, ran: CheckRan): RoundRow {
  return {
    repo: ctx.repo,
    pr: ctx.pr,
    kind: 'check',
    startedAt: ran.startedAt,
    endedAt: iso(now()),
    ms: ran.ms,
    ok: ran.judged.value !== null,
    head: null,
    base: null,
    depth: null,
    findings: [],
    failedCalls: 0,
    conclusion: ran.judged.value?.conclusion ?? null,
    open: ran.judged.value?.open ?? [],
    error: ran.judged.why,
    sha: ran.sha,
    title: ran.judged.value?.title ?? null,
  };
}

// When noslop has read no review of the PR's head, whether --fixes-only may stand for one; none
// when it has, and unknown when hq cannot tell, so the check's own failure is never hidden.
async function tryCheckUnreadHead(ctx: NoslopCheckContext, why: string | null): Promise<FixesOnlyBasis> {
  if (!isNoReviewRefusal(why)) {
    return { kind: 'none' };
  }
  try {
    return await checkFixesOnlyBasis({ run: ctx.run, db: ctx.db, slug: ctx.slug, repo: ctx.repo, pr: ctx.pr, dir: ctx.dir });
  } catch (error) {
    return { kind: 'unknown', since: null, why: String(error) };
  }
}

// noslop's words when it refused a --fixes-only run on the head the basis check just fetched.
async function findHeadRefusal(ctx: NoslopCheckContext): Promise<string | null> {
  const head = await findFetchedHead(ctx.run, ctx.dir, ctx.pr);
  return head === null ? null : findFixesOnlyRefusal(ctx.db, ctx.repo, ctx.pr, head);
}

function buildCheckFailure(checked: CheckRan, hint: string): NoslopCheckError {
  const why = checked.judged.why ?? 'unknown';
  return new NoslopCheckError(buildFailure(why, null, hint).message, why);
}

// The next step for a head noslop has not read: --fixes-only when nothing since the last review
// that ran its lenses is left for a lens and noslop has not refused it there, a new round when it
// has, what clears the commits when something is left, else nothing.
function formatFixesOnlyHint(ctx: NoslopCheckContext, basis: FixesOnlyBasis, refused: string | null): string {
  return match(basis)
    .with({ kind: 'open' }, () => formatOpenHint(ctx.repo, ctx.pr, refused))
    .with({ kind: 'shut' }, (b) => ` ${formatUnreadCommits(b.since, b.unread, 'This head cannot pass until those commits are answered, moved or checked.')}`)
    .with({ kind: 'unmapped' }, (b) => ` ${formatUnmappedHead(b.since, b.why, 'This head cannot pass until the rebase keeps each reviewed commit.').replace(/^./u, (first) => first.toUpperCase())}`)
    .with({ kind: 'none' }, { kind: 'unknown' }, () => '')
    .exhaustive();
}

function formatOpenHint(repo: string, pr: number, refused: string | null): string {
  if (refused !== null) {
    return ` noslop refused --fixes-only on this head (${refused}). The next step is a new review round: hq review ${repo} ${pr}.`;
  }
  return ` To check the fixes on this head without a new round, run hq review ${repo} ${pr} --fixes-only.`;
}
