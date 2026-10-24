// `hq review <repo> <pr>` and `hq review gate`: parse the arguments, run, and
// print what each engine found.
import type { Ctx, Out } from './commands.ts';
import { HqError } from './errors.ts';
import { checkRecordedGate } from './pr-status/check-recorded-gate.ts';
import { runReview } from './noslop/run-review.ts';
import { formatNoslopReview } from './noslop/format-noslop-review.ts';
import type { PRRequest } from './noslop/types.ts';
import { formatChecks } from './review/format-checks.ts';
import type { Effort, ReviewResult } from './review/types.ts';

function readPR(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    throw new HqError('bad_args', '--pr number is required');
  }
  if (!/^-?\d+$/u.test(raw)) {
    throw new HqError('bad_args', '--pr must be a whole number');
  }
  return Number(raw);
}

function readRepoArg(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new HqError('bad_args', '--repo is required');
  }
  return raw;
}

function toTextFlag(value: string | boolean | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function formatCodexReview(r: ReviewResult): string {
  const allowDeny = r.allowDeny.skipped ? [`== allow-or-deny pass skipped: ${r.allowDeny.skipped}`] : [`== allow-or-deny (codex exit ${r.allowDeny.code})`, r.allowDeny.answer],
    install = r.install.ok ? r.install.detail : `FAILED, so the review is static: ${r.install.detail}`;
  return [
    `== effort: ${r.effort.effort} (${r.effort.reason})`,
    `== install: ${install}`,
    `== codex (exit ${r.codexCode}, full review: ${r.reviewFile})`,
    r.codexTail,
    ...allowDeny,
    ...formatChecks(r),
  ].join('\n');
}

function buildRequest(ctx: Ctx, rawRepo: string | undefined, rawPR: string | undefined): PRRequest {
  return { run: ctx.run, db: ctx.db, rawRepo: readRepoArg(rawRepo), pr: readPR(rawPR), repoDir: toTextFlag(ctx.flags['repo-dir']) };
}

async function runReviewPR(ctx: Ctx): Promise<Out> {
  const base = buildRequest(ctx, ctx.verb, ctx.rest[0]),
    effort = toTextFlag(ctx.flags.effort) as Effort | undefined,
    result = await runReview({ ...base, watch: !ctx.flags['no-watch'], effort, full: ctx.flags.full === true, fixesOnly: ctx.flags['fixes-only'] === true, confirm: ctx.flags.confirm === true });
  if ('engine' in result) {
    return { data: { ...result }, text: formatNoslopReview(result) };
  }
  return { data: { engine: 'codex', ...result }, text: formatCodexReview(result) };
}

async function runGatePR(ctx: Ctx): Promise<Out> {
  const r = await checkRecordedGate(buildRequest(ctx, ctx.rest[0], ctx.rest[1]));
  return { data: { ...r }, text: `may merge: ${r.reason}` };
}

export async function runReviewCommand(ctx: Ctx): Promise<Out> {
  if (ctx.verb === 'gate') {
    return await runGatePR(ctx);
  }
  return await runReviewPR(ctx);
}
