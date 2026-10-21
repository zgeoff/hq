import { z } from 'zod';

// What merged-prs.sh prints, daily or weekly: a week has the same shape as a day. Every field is
// required, since render-report.sh or the week's merge reads each one. fetched counts every PR
// GitHub sent, and searchCount every PR it found.
export const mergedPRsOutputSchema = z.object({
  kind: z.enum(['daily', 'weekly']),
  start: z.string(),
  end: z.string(),
  searchCount: z.number(),
  fetched: z.number(),
  totals: buildTotalsSchema(),
  byRepo: z.array(buildRepoRowSchema()),
  byIssue: z.array(buildIssueRowSchema()),
  noIssue: z.array(buildNoIssuePRSchema()),
  prs: z.array(buildMergedPRSchema()),
  workflow: z.array(buildWorkflowPRSchema()),
});
export type MergedPRsOutput = z.infer<typeof mergedPRsOutputSchema>;

function buildTotalsSchema() {
  return z.object({ prs: z.number(), issues: z.number(), repos: z.number(), added: z.number(), removed: z.number() });
}

function buildRepoRowSchema() {
  return z.object({ repo: z.string(), prs: z.number(), added: z.number(), removed: z.number() });
}

function buildIssueRowSchema() {
  const prLink = z.object({ repo: z.string(), number: z.number(), url: z.string() });
  return z.object({ issue: z.string(), repos: z.array(z.string()), added: z.number(), removed: z.number(), prs: z.array(prLink) });
}

function buildNoIssuePRSchema() {
  return z.object({ repo: z.string(), number: z.number(), title: z.string(), url: z.string() });
}

function buildMergedPRSchema() {
  return z.object({
    repo: z.string(),
    number: z.number(),
    title: z.string(),
    url: z.string(),
    mergedAt: z.string(),
    day: z.string(),
    issue: z.string().nullable(),
    added: z.number(),
    removed: z.number(),
    excludedFiles: z.array(z.string()),
    approximate: z.boolean(),
  });
}

function buildWorkflowPRSchema() {
  return z.object({ repo: z.string(), number: z.number(), title: z.string(), url: z.string(), mergedAt: z.string() });
}
