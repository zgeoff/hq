import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { buildSkillBrief } from './build-skill-brief.ts';
import { buildSkillPointer } from './build-skill-pointer.ts';
import { readBriefIssue } from './read-brief-issue.ts';
import { readBriefTemplate } from './read-brief-template.ts';
import { readRefFile } from './read-ref-file.ts';
import { readRefSHA } from './read-ref-sha.ts';
import type { BriefDeps, SkillBriefInput } from './types.ts';

// Fills the design or PR-walk brief for one Linear issue and prints it, with a pointer to the hq
// skill its agent reads first. It reads Linear and GitHub, and writes nothing.
export async function runSkillBriefCommand(deps: Pick<BriefDeps, 'linear' | 'run'>, input: SkillBriefInput): Promise<Out> {
  const issue = await readBriefIssue(deps.linear, input.issue);
  const sha = await readRefSHA(deps.run, input.ref);
  const template = await readBriefTemplate(deps.run, sha, `agent-kit/${input.kind}-brief.md`);
  const skill = buildSkillPointer(input.kind, sha);
  if ((await readRefFile(deps.run, sha, skill.path)) === null) {
    throw new HqError('not_found', `${skill.path} is missing at ${sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges`);
  }
  return buildSkillBrief({ issue, sha, kind: input.kind, template, skill });
}
