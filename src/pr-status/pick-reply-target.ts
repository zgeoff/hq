import { OWNER } from '../releases/owner.ts';
import type { PRComment } from './read-pr-comments.ts';

export type ReplyTarget = { kind: 'standing'; url: string } | { kind: 'thread'; opener: PRComment } | { kind: 'issue' } | { kind: 'missing' };

const ID_LINE = /^(?<id>[0-9a-f]{16})\s+(?<answer>\S.*)$/u;
const DISPOSITION = /^(?<kind>\S+)\s+(?<value>\S.*)$/u;

export function pickThreadTarget(review: readonly PRComment[], finding: string): ReplyTarget | null {
  const opener = findFindingComment(review, finding);
  if (opener === undefined) {
    return null;
  }
  const replies = review.filter((comment) => comment.replyTo === opener.id);
  const standing = findStandingAcceptance(replies, finding, 'thread');
  return standing === null ? { kind: 'thread', opener } : { kind: 'standing', url: standing.url };
}

// noslop posts a finding outside the diff in the PR's issue comments.
export function pickIssueTarget(issue: readonly PRComment[], finding: string): ReplyTarget {
  if (findFindingComment(issue, finding) === undefined) {
    return { kind: 'missing' };
  }
  const standing = findStandingAcceptance(issue, finding, 'issue');
  return standing === null ? { kind: 'issue' } : { kind: 'standing', url: standing.url };
}

// The match is on the noslop marker's `"id":"<id>"`, never the id anywhere in the body, so a reply
// lands in no other finding's thread.
function findFindingComment(comments: readonly PRComment[], finding: string): PRComment | undefined {
  const marker = `"id":"${finding}"`;
  return comments.find((comment) => (comment.replyTo ?? null) === null && comment.type === 'Bot' && comment.body.includes('<!-- noslop:') && comment.body.includes(marker));
}

// noslop counts a finding's latest disposition, so an acceptance stands only when the owner's latest
// valid answer to the finding is one.
function findStandingAcceptance(comments: readonly PRComment[], finding: string, form: 'thread' | 'issue'): PRComment | null {
  const answered = comments.filter((comment) => isOwner(comment)).map((comment) => ({ comment, kind: parseDispositionKind(comment.body, finding, form) }));
  const latest = answered.findLast((entry) => entry.kind !== null);
  return latest?.kind === 'accepted-risk' ? latest.comment : null;
}

// noslop reads the disposition from the last id-led line naming the finding, or in a thread with no
// id-led line, the first line.
function parseDispositionKind(body: string, finding: string, form: 'thread' | 'issue'): string | null {
  const lines = body.split('\n').map((line) => line.trim());
  const idLines = lines.map((line) => ID_LINE.exec(line)?.groups).filter((groups) => groups !== undefined);
  if (idLines.length > 0) {
    const own = idLines.findLast((groups) => groups['id'] === finding);
    return own === undefined ? null : parseKind(own['answer'] ?? '');
  }
  return form === 'thread' ? parseKind(lines.find((line) => line !== '') ?? '') : null;
}

function parseKind(answer: string): string | null {
  if (answer === 'fixed') {
    return 'fixed';
  }
  return DISPOSITION.exec(answer)?.groups?.['kind'] ?? null;
}

export function isOwner(comment: PRComment): boolean {
  return comment.login?.toLowerCase() === OWNER;
}
