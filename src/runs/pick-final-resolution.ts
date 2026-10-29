import { collectShaMatches } from './collect-sha-matches.ts';
import type { CommitRead, CommitsRead, FinalResolution } from './types.ts';

// GitHub lists at most this many commits of a PR, so a list this long may not end at the head.
const COMMITS_LIMIT = 250;

export function pickFinalResolution(given: string, commits: CommitsRead, lookup: CommitRead | null): FinalResolution {
  if (commits.kind === 'fault') {
    return { kind: 'unresolved', reason: commits.reason };
  }
  const matches = collectShaMatches(commits.shas, given);
  const [only] = matches;
  if (matches.length > 1) {
    return { kind: 'refused', reason: 'ambiguous', shas: matches };
  }
  if (only !== undefined) {
    return { kind: 'full', sha: only.toLowerCase() };
  }
  if (lookup?.kind === 'found') {
    return { kind: 'full', sha: lookup.sha.toLowerCase() };
  }
  if (lookup?.kind === 'fault') {
    return { kind: 'unresolved', reason: lookup.reason };
  }
  const head = commits.shas.length > 0 && commits.shas.length < COMMITS_LIMIT ? (commits.shas.at(-1) ?? null) : null;
  return { kind: 'refused', reason: 'no-match', head };
}
