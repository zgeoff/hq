import { HqError } from '../errors.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

// The full sha of the one head the PR has an answer at that starts with `prefix`. Throws when none
// does, or when the prefix fits more than one.
export function getAnswerHead(answers: readonly OwnerAnswer[], prefix: string): string {
  const lower = prefix.toLowerCase();
  const heads = [...new Set(answers.flatMap((answer) => (answer.head?.startsWith(lower) === true ? [answer.head] : [])))];
  const [only] = heads;
  if (only === undefined) {
    throw new HqError('bad_args', `no answer is recorded at a head starting ${lower}, so there is no lgtm to carry`);
  }
  if (heads.length > 1) {
    throw new HqError('bad_args', `--from ${lower} fits ${heads.length} heads with answers (${heads.map((head) => head.slice(0, 12)).join(', ')}); give more of the sha`);
  }
  return only;
}
