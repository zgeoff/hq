import { match } from 'ts-pattern';
import { collectShaMatches } from './collect-sha-matches.ts';
import type { CommitRead, CommitsRead, FinalResolution } from './types.ts';

export function pickFinalResolution(given: string, commits: CommitsRead, lookup: CommitRead | null): FinalResolution {
  return match(commits)
    .returnType<FinalResolution>()
    .with({ kind: 'fault' }, (fault) => ({ kind: 'unresolved', reason: fault.reason }))
    .with({ kind: 'listed' }, (listed) => pickFromList(given, listed.shas, lookup))
    .exhaustive();
}

// GitHub lists at most this many commits of a PR, so a list this long may not end at the head.
const COMMITS_LIMIT = 250;

function pickFromList(given: string, shas: string[], lookup: CommitRead | null): FinalResolution {
  const matches = collectShaMatches(shas, given);
  const [only] = matches;
  if (matches.length > 1) {
    return { kind: 'refused', reason: 'ambiguous', shas: matches };
  }
  if (only !== undefined) {
    return { kind: 'full', sha: only.toLowerCase() };
  }
  const head = shas.length > 0 && shas.length < COMMITS_LIMIT ? (shas.at(-1) ?? null) : null;
  return match(lookup)
    .returnType<FinalResolution>()
    .with({ kind: 'found' }, (found) => ({ kind: 'full', sha: found.sha.toLowerCase() }))
    .with({ kind: 'fault' }, (fault) => ({ kind: 'unresolved', reason: fault.reason }))
    .with({ kind: 'missing' }, null, () => ({ kind: 'refused', reason: 'no-match', head }))
    .exhaustive();
}
