// `hq review <repo> <pr>`, `hq review check` and `hq review gate`: parse the arguments, run, and
// print what each engine found.
import type { Ctx, Out } from './commands.ts';
import { HqError } from './errors.ts';
import { checkRecordedGate } from './pr-status/check-recorded-gate.ts';
import { runReview } from './noslop/run-review.ts';
import { formatNoslopReview } from './noslop/format-noslop-review.ts';
import { runReviewCheck } from './noslop/run-review-check.ts';
import type { PRRequest } from './noslop/run-review-check.ts';
import { formatChecks } from './review/format-checks.ts';
import type { Effort, ReviewResult } from './review/types.ts';
import type { NoslopCheckResult } from './noslop/run-noslop-check.ts';

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

function readRedesign(value: string | boolean | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.trim() === '') {
    throw new HqError('bad_redesign', '--redesign needs the id of the finding that forced the redesign');
  }
  return value.trim();
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

function formatCheck(r: NoslopCheckResult): string {
  const open = r.open.map((o) => `  - ${o.id}: ${o.title} (${o.reason})`);
  return [`== noslop check: ${r.conclusion}`, r.title, ...open].join('\n');
}

function buildRequest(ctx: Ctx, rawRepo: string | undefined, rawPR: string | undefined): PRRequest {
  return { run: ctx.run, db: ctx.db, rawRepo: readRepoArg(rawRepo), pr: readPR(rawPR), repoDir: toTextFlag(ctx.flags['repo-dir']) };
}

async function runReviewPR(ctx: Ctx): Promise<Out> {
  const base = buildRequest(ctx, ctx.verb, ctx.rest[0]),
    effort = toTextFlag(ctx.flags.effort) as Effort | undefined,
    r = await runReview({ ...base, watch: !ctx.flags['no-watch'], effort, full: ctx.flags.full === true, redesign: readRedesign(ctx.flags.redesign), fixesOnly: ctx.flags['fixes-only'] === true, confirm: ctx.flags.confirm === true });
  if ('engine' in r) {
    return { data: { ...r }, text: formatNoslopReview(r) };
  }
  return { data: { engine: 'codex', ...r }, text: formatCodexReview(r) };
}

async function runCheckPR(ctx: Ctx): Promise<Out> {
  const r = await runReviewCheck(buildRequest(ctx, ctx.rest[0], ctx.rest[1]));
  return { data: { ...r }, text: formatCheck(r) };
}

async function runGatePR(ctx: Ctx): Promise<Out> {
  const r = await checkRecordedGate(buildRequest(ctx, ctx.rest[0], ctx.rest[1]));
  return { data: { ...r }, text: `may merge: ${r.reason}` };
}

export async function runReviewCommand(ctx: Ctx): Promise<Out> {
  if (ctx.verb === 'check') {
    return await runCheckPR(ctx);
  }
  if (ctx.verb === 'gate') {
    return await runGatePR(ctx);
  }
  return await runReviewPR(ctx);
}
