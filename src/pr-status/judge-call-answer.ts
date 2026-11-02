import type { AnswerSourceRequest } from './read-answer-source-refusal.ts';
import { hasPRName } from './has-pr-name.ts';
import { isPlainYes } from './is-plain-yes.ts';

export interface CallEvidence {
  title: string;

  answer: string | null;
}

export function judgeCallAnswer(request: AnswerSourceRequest, evidence: CallEvidence | null): string | null {
  if (evidence === null) {
    return `${request.source} is not a call in hq`;
  }
  if (evidence.answer === null) {
    return `${request.source} has no owner answer for its current round, in the console or by \`hq call answer\` from the owner's session (z-stu), as atc finds the caller`;
  }
  if (!hasPRName(evidence.title, request.ref)) {
    return `${request.source} does not name ${request.ref.slug}#${request.ref.pr} in the title the owner answered`;
  }
  if (request.answer === 'lgtm' && !isPlainYes(evidence.answer)) {
    return `the owner's answer to ${request.source} is not a plain yes: "${evidence.answer}"`;
  }
  return null;
}
