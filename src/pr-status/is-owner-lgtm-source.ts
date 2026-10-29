import { isAnswerSource } from './is-answer-source.ts';
import { isRebasedSource } from './is-rebased-source.ts';

// Whether an lgtm's source stands for the owner's word: an answer source, or a rebased: carry of one.
export function isOwnerLgtmSource(source: string): boolean {
  return isAnswerSource(source) || isRebasedSource(source);
}
