import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HEX40 } from '../releases/hex40.ts';
import type { RunResult } from '../runner/types.ts';
import type { MergeFacts } from './close-pr.ts';

export type GitHubPr = { state: 'OPEN' | 'CLOSED' } | ({ state: 'MERGED' } & MergeFacts);

const ANSWER = z.object({
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  mergedAt: z.string().nullish(),
  mergeCommit: z.object({ oid: z.string() }).nullish(),
});

// What one `gh pr view --json state,mergedAt,mergeCommit` answer says about a run PR, or the reason
// hq can't tell.
export function parseGitHubPR(ref: string, view: RunResult): GitHubPr | { error: string } {
  if (view.code !== 0) {
    return { error: `${ref}: can't read it (gh exit ${view.code}): ${(view.stderr || view.stdout).trim().slice(0, 200)}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(view.stdout);
  } catch {
    return { error: `${ref}: gh gave no JSON` };
  }
  const answer = ANSWER.safeParse(json);
  if (!answer.success) {
    return { error: `${ref}: gh gave no state` };
  }
  if (answer.data.state !== 'MERGED') {
    return { state: answer.data.state };
  }
  const mergedAt = new Date(answer.data.mergedAt ?? Number.NaN);
  if (Number.isNaN(mergedAt.getTime())) {
    return { error: `${ref}: GitHub says merged but gave no merge time` };
  }
  const oid = answer.data.mergeCommit?.oid ?? '';
  return { state: 'MERGED', mergedAt: iso(mergedAt), mergeSha: HEX40.test(oid) ? oid : null };
}
