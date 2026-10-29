import { isAnswerSource } from './is-answer-source.ts';
import { isRebasedSource } from './is-rebased-source.ts';

export function isOwnerLgtmSource(source: string): boolean {
  return isAnswerSource(source) || isRebasedSource(source);
}
