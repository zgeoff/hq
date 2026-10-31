import { match } from 'ts-pattern';
import type { BriefSkill, SkillBriefKind } from './types.ts';

// The hq skill a kind's agent reads first, and the pinned command that prints it, since an agent
// outside zgeoff/hq has no copy of hq's skills.
export function buildSkillPointer(kind: SkillBriefKind, sha: string): BriefSkill {
  const name = match(kind)
    .with('design', () => 'tickets')
    .with('pr-walk', () => 'fix-it-here')
    .exhaustive();
  const path = `skills/${name}/SKILL.md`;
  return { name, path, command: `gh api 'repos/zgeoff/hq/contents/${path}?ref=${sha}' -H 'Accept: application/vnd.github.raw'` };
}
