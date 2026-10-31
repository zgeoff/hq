import type { Flags } from '../cli.ts';
import { HqError } from '../errors.ts';
import { parseBriefFlags } from './parse-brief-flags.ts';
import type { SkillBriefInput, SkillBriefKind } from './types.ts';

const DELIVERY_FLAGS = ['goal-file', 'imp', 'issue-by-link'] as const;

export function parseSkillBriefFlags(issue: string | undefined, flags: Flags, kind: SkillBriefKind): SkillBriefInput {
  const flag = DELIVERY_FLAGS.find((name) => flags[name] !== undefined);
  if (flag !== undefined) {
    throw new HqError('bad_args', `--${flag} does not apply to --kind ${kind}`);
  }
  const input = parseBriefFlags(issue, flags);
  return { issue: input.issue, ref: input.ref, kind, repo: input.repo };
}
