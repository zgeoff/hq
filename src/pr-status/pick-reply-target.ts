import { OWNER } from '../releases/owner.ts';
import type { PRComment } from './read-pr-comments.ts';

// Where the owner's accepted-risk reply for a finding goes, decided from the PR's comments alone:
// it stands already, it goes in the finding's thread on the diff, or it goes in the issue comments.
export type ReplyTarget = { kind: 'standing'; url: string } | { kind: 'thread'; opener: PRComment } | { kind: 'issue' } | { kind: 'missing' };

const ID_LINE = /^(?<id>[0-9a-f]{16})\s+(?<answer>\S.*)$/u;
const DISPOSITION = /^(?<kind>\S+)\s+(?<value>\S.*)$/u;

// The target among the threads on the diff, or null when no noslop comment there holds the finding,
// so the caller reads the issue comments next.
export function pickThreadTarget(review: readonly PRComment[], finding: string): ReplyTarget | null {
  const opener = findFindingComment(review, finding);
  if (opener === undefined) {
    return null;
  }
  const replies = review.filter((comment) => comment.replyTo === opener.id);
  const standing = findStandingAcceptance(replies, finding, 'thread');
  return standing === null ? { kind: 'thread', opener } : { kind: 'standing', url: standing.url };
}

// The target among the PR's issue comments: noslop posts a finding outside the diff there.
export function pickIssueTarget(issue: readonly PRComment[], finding: string): ReplyTarget {
  if (findFindingComment(issue, finding) === undefined) {
    return { kind: 'missing' };
  }
  const standing = findStandingAcceptance(issue, finding, 'issue');
  return standing === null ? { kind: 'issue' } : { kind: 'standing', url: standing.url };
}

// A top-level comment of a bot whose noslop marker names the finding. The match is on the marker's
// `"id":"<id>"`, never the id anywhere in the body, so a reply lands in no other finding's thread.
function findFindingComment(comments: readonly PRComment[], finding: string): PRComment | undefined {
  const marker = `"id":"${finding}"`;
  return comments.find((comment) => (comment.replyTo ?? null) === null && comment.type === 'Bot' && comment.body.includes('<!-- noslop:') && comment.body.includes(marker));
}

// The owner's comment that stands as an accepted risk: noslop counts a finding's latest disposition,
// so an acceptance stands only when the owner's latest valid answer to the finding is one.
function findStandingAcceptance(comments: readonly PRComment[], finding: string, form: 'thread' | 'issue'): PRComment | null {
  const answered = comments.filter((comment) => isOwner(comment)).map((comment) => ({ comment, kind: parseDispositionKind(comment.body, finding, form) }));
  const latest = answered.findLast((entry) => entry.kind !== null);
  return latest?.kind === 'accepted-risk' ? latest.comment : null;
}

// The disposition kind a comment gives the finding, as noslop reads it: the last id-led line naming
// the finding, or in a thread with no id-led line, the first line. Null when it gives none, such as
// `accepted-risk` with no reason.
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
