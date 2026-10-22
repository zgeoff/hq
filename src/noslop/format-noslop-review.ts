import { formatChecks } from '../review/format-checks.ts';
import { formatNotReviewed } from './format-not-reviewed.ts';
import type { NoslopReviewOutcome, TitledFixCheck } from './run-review.ts';

// `hq review`'s text for a noslop review: engine, issue, findings, the files no call read, then CI.
export function formatNoslopReview(r: NoslopReviewOutcome): string {
  if (r.fixesOnly) {
    return formatFixesOnly(r);
  }
  const findings = r.findings.map((f) => `  - [${f.severity}] ${f.lens}: ${f.title} (${f.id})`);
  return [
    `== engine: noslop (commit ${r.sha.slice(0, 7)}, depth ${r.depth ?? 'unknown'})`,
    ...formatFullDropped(r),
    `== issue: ${r.issue.issue ?? 'none'} (${r.issue.why})`,
    `== noslop: ${r.findings.length} finding(s), full output: ${r.reviewFile}`,
    ...formatPostFailed(r),
    ...findings,
    ...formatNotReviewed(r.notReviewed),
    ...formatChecks(r),
  ].join('\n');
}

function formatFullDropped(r: NoslopReviewOutcome): string[] {
  if (!r.fullDropped) {
    return [];
  }
  return [`== --full dropped: round ${r.round} reviews only the commits since round 1.`];
}

// The review file holds the result exactly as noslop printed it, which is what `noslop post` reads.
function formatPostFailed(review: NoslopReviewOutcome): string[] {
  if (review.postFailed === null) {
    return [];
  }
  return [`== not posted: noslop stored this review but did not post it to GitHub (${review.postFailed}). Run noslop post ${review.reviewFile} to finish the post.`];
}

// A --fixes-only run raises no finding, so its text is the verdict on each fix and the check after.
function formatFixesOnly(r: NoslopReviewOutcome): string {
  return [
    `== engine: noslop (commit ${r.sha.slice(0, 7)}), fixes only: ${r.fixChecks.length} fix(es) checked, full output: ${r.reviewFile}`,
    ...formatPostFailed(r),
    ...r.fixChecks.map(formatFixCheck),
    ...formatNotReviewed(r.notReviewed),
    `== noslop check: ${r.checksError === null ? (r.checks.find((check) => check.name === 'noslop')?.state ?? 'none') : 'unknown'}`,
    ...formatChecks(r),
  ].join('\n');
}

function formatFixCheck(c: TitledFixCheck): string {
  const title = c.title === null ? '' : ` (${c.title})`;
  return c.fixed ? `  - ${c.findingID} fixed${title}` : `  - ${c.findingID} not fixed: ${c.reason}${title}`;
}
