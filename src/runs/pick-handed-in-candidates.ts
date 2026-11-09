import type { StoredEvent } from '../read-events.ts';

interface HandedInPR {
  issue: string;
  state: string;
  final_sha: string | null;
  merged_at: string | null;
}

export interface HandedInSessionRow {
  issue: string;
  session_id: string;
  active: number;
}

export interface HandedInFactsRead {
  prs: readonly HandedInPR[];
  sessions: readonly HandedInSessionRow[];
  lastKept: ReadonlyMap<string, StoredEvent | null>;
}

export interface HandedInCandidate {
  issue: string;
  rows: HandedInSessionRow[];
  ids: string[];
  lastKept: StoredEvent | null;
}

// A run with an active session is a candidate once every PR has merged with a FINAL before the
// quiet time, and its last kept wrap-up is past the retry wait.
export function pickHandedInCandidates(facts: HandedInFactsRead, at: Date, quietBefore: number): HandedInCandidate[] {
  const candidates: HandedInCandidate[] = [];
  for (const issue of new Set(facts.sessions.filter((row) => row.active === 1).map((row) => row.issue))) {
    const lastKept = facts.lastKept.get(issue) ?? null;
    if (hasHandedInPRs(facts.prs.filter((row) => row.issue === issue), quietBefore) && !isKeptRecently(lastKept, at)) {
      const rows = facts.sessions.filter((row) => row.issue === issue);
      candidates.push({ issue, rows, ids: rows.filter((row) => row.active === 1).map((row) => row.session_id), lastKept });
    }
  }
  return candidates;
}

function hasHandedInPRs(prs: readonly HandedInPR[], quietBefore: number): boolean {
  const merged = prs.filter((row) => row.state === 'merged');
  return merged.length > 0 && merged.length === prs.length && merged.every((row) => row.final_sha !== null && Date.parse(row.merged_at ?? '') <= quietBefore);
}

// Each retry of a kept session reads its work again, an imp exec of up to 2 minutes or a local git
// check, so a run whose wrap-up kept a session waits this long before the next try.
const KEPT_RETRY_MS = 30 * 60_000;

function isKeptRecently(lastKept: StoredEvent | null, at: Date): boolean {
  return lastKept !== null && Date.parse(lastKept.at) > at.getTime() - KEPT_RETRY_MS;
}
