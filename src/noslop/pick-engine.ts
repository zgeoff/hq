import { HqError } from '../errors.ts';

export type Engine = 'codex' | 'noslop';

export interface EngineInput {
  repo: string;
  listed: boolean;
  pinned: string | null;
}

export function pickEngine(input: EngineInput): Engine {
  if (!input.listed) {
    return 'codex';
  }
  if (input.pinned === null) {
    throw new HqError('bad_config', `noslop is on for ${input.repo} but no commit is pinned: hq noslop pin <sha>`);
  }
  return 'noslop';
}
