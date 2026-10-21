import { HqError } from '../errors.ts';
import type { PriorRounds } from './get-prior-rounds.ts';

export type Engine = 'codex' | 'noslop';

export interface EngineInput extends PriorRounds {
  repo: string;
  listed: boolean;
  pinned: string | null;
}

// A listed repo gets noslop, except a PR that already had a Codex round finishes on Codex. A PR
// that already had a noslop round keeps noslop while its repo stays listed. Unlisted: Codex.
export function pickEngine(input: EngineInput): Engine {
  if (!input.listed) {
    return 'codex';
  }
  if (!input.noslopBefore && input.codexBefore) {
    return 'codex';
  }
  if (input.pinned === null) {
    throw new HqError('bad_config', `noslop is on for ${input.repo} but no commit is pinned: hq noslop pin <sha>`);
  }
  return 'noslop';
}
