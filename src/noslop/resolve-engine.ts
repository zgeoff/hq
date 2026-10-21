import type { Database } from 'bun:sqlite';
import { buildReviewStem } from '../review/build-review-stem.ts';
import { reviewDir } from '../review/review-dir.ts';
import { getPriorRounds } from './get-prior-rounds.ts';
import { isNoslopListed } from './is-noslop-listed.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { Engine } from './pick-engine.ts';
import { pickEngine } from './pick-engine.ts';

export interface ResolvedEngine {
  engine: Engine;
  sha: string | null;
}

// The engine for a PR of a repo, from the noslop list in hq.db and the rounds the PR has had.
export function resolveEngine(db: Database, owner: string, repo: string, pr: number): ResolvedEngine {
  const settings = loadNoslopSettings(db),
    state = getPriorRounds(db, repo, pr, `${reviewDir()}/${buildReviewStem(owner, repo, pr)}-review.md`);
  return {
    engine: pickEngine({ repo, listed: isNoslopListed(settings, owner, repo), codexBefore: state.codexBefore, noslopBefore: state.noslopBefore, pinned: settings.sha }),
    sha: settings.sha,
  };
}
