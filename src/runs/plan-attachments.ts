import { IN_SCOPE } from '../scope/in-scope.ts';
import { collectNamedIssues } from './collect-named-issues.ts';

export interface OpenPR {
  repo: string;
  number: number;
  body: string;
}

export interface PlannedAttach {
  ref: string;
  issue: string;
  url: string;
}

// Which open PRs go to which open run: a PR in scope that no run holds goes to the open run its body
// names with a "Fixes" or "Contributes to" line. Two different open runs named attach it to neither.
export function planAttachments(prs: OpenPR[], attached: ReadonlySet<string>, openRuns: ReadonlySet<string>): { attach: PlannedAttach[]; errors: string[] } {
  const attach: PlannedAttach[] = [];
  const errors: string[] = [];
  for (const pr of prs) {
    const ref = `${pr.repo}#${pr.number}`;
    if (!IN_SCOPE.includes(pr.repo) || attached.has(ref)) {
      continue;
    }
    const named = collectNamedIssues(pr.body).filter((issue) => openRuns.has(issue));
    if (named.length > 1) {
      errors.push(`${ref}: its body names ${named.join(' and ')}, so hq attaches it to neither`);
    } else if (named[0] !== undefined) {
      attach.push({ ref, issue: named[0], url: `https://github.com/zgeoff/${pr.repo}/pull/${pr.number}` });
    }
  }
  return { attach, errors };
}
