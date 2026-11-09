import { seedInReviewIssue } from './seed-in-review-issue.ts';
import { seedLinearIssue } from './seed-linear-issue.ts';
import { seedLinearIssueOfUnknownType } from './seed-linear-issue-of-unknown-type.ts';
import { seedStartedIssue } from './seed-started-issue.ts';
import { seedStartedPR } from './seed-started-pr.ts';
import type { LinearDeps } from './types.ts';

export function buildLinearSeeder(deps: LinearDeps) {
  return {
    linearIssue: (input?: Parameters<typeof seedLinearIssue>[1]) => seedLinearIssue(deps, input),
    linearIssueOfUnknownType: (input: Parameters<typeof seedLinearIssueOfUnknownType>[1]) => seedLinearIssueOfUnknownType(deps, input),
    startedIssue: (input?: Parameters<typeof seedStartedIssue>[1]) => seedStartedIssue(deps, input),
    startedPR: (input?: Parameters<typeof seedStartedPR>[1]) => seedStartedPR(deps, input),
    inReviewIssue: (input?: Parameters<typeof seedInReviewIssue>[1]) => seedInReviewIssue(deps, input),
  };
}
