import { parsePRURL } from '../parse-pr-url.ts';
import type { AnswerSourceRequest } from './read-answer-source-refusal.ts';

export interface ConsoleReviewEvidence {
  review: string;
  prURL: string | null;
  storedAtHead: boolean;
}

// A console: source is the owner's answer on this PR only as the owner's console review of this PR,
// with this answer, that the console stored at the head gh gives now. null evidence: no such review.
export function judgeConsoleReview(request: AnswerSourceRequest, evidence: ConsoleReviewEvidence | null): string | null {
  if (evidence === null) {
    return `${request.source} names no owner review in the console`;
  }
  const named = parsePRURL(evidence.prURL ?? '');
  if (named === null || `${named.owner}/${named.repo}`.toLowerCase() !== request.ref.slug.toLowerCase() || named.number !== request.ref.pr) {
    return `${request.source} is not the owner's console review of ${request.ref.slug}#${request.ref.pr}`;
  }
  if (evidence.review !== request.answer) {
    return `the owner's console review ${request.source} is ${evidence.review}, not ${request.answer}`;
  }
  if (!evidence.storedAtHead) {
    return `the console stored ${request.source} at no head or another head, not ${request.head.slice(0, 7)}, the head gh gives now`;
  }
  return null;
}
