import type { FinalMarks } from './is-final-answered.ts';
import { isFinalAnswered } from './is-final-answered.ts';
import type { RunPr } from './types.ts';

export function formatPRTag(pr: FinalMarks & Pick<RunPr, 'state' | 'review_round'>): string {
  if (pr.state !== 'open') {
    return pr.state;
  }
  if (pr.final_sha === null) {
    return 'open';
  }
  return isFinalAnswered(pr) ? `reviewed r${pr.review_round}` : `final ${pr.final_sha.slice(0, 7)}`;
}
