import type { UnreadCommit } from './check-fixes-only-basis.ts';
import { UNNAMED_ADVICE } from './unnamed-advice.ts';

const BELOW_ADVICE = 'A commit below the base the last review read is in neither the base nor a merged PR, so no lens has read it in this PR: run a full review, hq review <repo> <pr>.',
  FOREIGN_ADVICE = 'A merge of a branch other than the base brings in code no lens has read: move it to a new PR, or drop it.',
  MAX_LISTED = 5,
  REJECTED_ADVICE = 'noslop judged the conflict resolution of a merge not sound: fix it, then run hq review <repo> <pr> --fixes-only and answer any finding it raises.',
  UNCLEAN_ADVICE = 'noslop checks the conflict resolution of a merge in a fixes-only run, which has not checked this one yet: run hq review <repo> <pr> --fixes-only, and answer any finding it raises.';

// The commits after the last review that ran its lenses which no fixed answer names, or merges that
// are not clean merges of the base: up to 5 short shas, `verdict` (a sentence, or empty), then the advice
// for each kind present.
export function formatUnreadCommits(since: string, unread: readonly UnreadCommit[], verdict: string): string {
  const advice = [unread.some((c) => c.kind === 'unnamed') ? UNNAMED_ADVICE : null, unread.some((c) => c.kind === 'unclean-merge') ? UNCLEAN_ADVICE : null, unread.some((c) => c.kind === 'rejected-merge') ? REJECTED_ADVICE : null, unread.some((c) => c.kind === 'foreign-merge') ? FOREIGN_ADVICE : null, unread.some((c) => c.kind === 'unreviewed') ? BELOW_ADVICE : null].filter((line) => line !== null),
    listed = unread.slice(0, MAX_LISTED).map((c) => `${c.sha.slice(0, 7)}${pickLabel(c.kind)}`),
    more = unread.length > MAX_LISTED ? ', …' : '';
  return [`${unread.length} commit(s) after the last review (${since.slice(0, 7)}) are not accounted for: ${listed.join(', ')}${more}. No lens has read them.`, verdict, ...advice].filter((part) => part !== '').join(' ');
}

function pickLabel(kind: UnreadCommit['kind']): string {
  if (kind === 'unnamed') {
    return '';
  }
  return kind === 'unreviewed' ? ' (below the review base)' : ' (merge)';
}
