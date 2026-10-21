import { UNNAMED_ADVICE } from './unnamed-advice.ts';

const REBASE_ADVICE = 'Rebase without changing or dropping a reviewed commit.';

// Why the last review that ran its lenses (`since`) maps onto no commit of the rebased branch, then
// `verdict` (a sentence, or empty) and the advice for moving code or asking for a fix commit.
export function formatUnmappedHead(since: string, why: string, verdict: string): string {
  return [`the last review (${since.slice(0, 7)}) does not map onto the rebased branch: ${why}.`, verdict, REBASE_ADVICE, UNNAMED_ADVICE].filter((part) => part !== '').join(' ');
}
