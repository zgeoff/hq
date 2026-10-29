import type { Runner } from '../runner/types.ts';
import { buildFinalKey } from './build-final-key.ts';
import { collectShaMatches } from './collect-sha-matches.ts';
import { pickFinalResolution } from './pick-final-resolution.ts';
import { readCommit } from './read-commit.ts';
import { readPRCommits } from './read-pr-commits.ts';
import type { CommitsRead, FinalClaim, FinalResolution, FinalResolutions } from './types.ts';

export function makeFinalResolver(run: Runner): (claims: FinalClaim[]) => Promise<FinalResolutions> {
  const lists = new Map<string, Promise<CommitsRead>>();
  const settled = new Map<string, FinalResolution>();
  return async (claims) => {
    for (const claim of claims) {
      const key = buildFinalKey(claim.ref, claim.sha);
      if (settled.has(key)) {
        continue;
      }
      const pending = lists.get(claim.ref) ?? readPRCommits(run, claim.ref);
      lists.set(claim.ref, pending);
      const commits = await pending;
      const missed = commits.kind === 'listed' && collectShaMatches(commits.shas, claim.sha).length === 0;
      const lookup = missed ? await readCommit(run, claim.ref, claim.sha) : null;
      settled.set(key, pickFinalResolution(claim.sha, commits, lookup));
    }
    return settled;
  };
}
