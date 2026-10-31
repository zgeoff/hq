import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { buildAgentDesignBrief, pickExtraDesignActions } from './build-agent-design-brief.ts';
import { buildPlaybook } from './build-playbook.ts';
import { buildSkillBrief } from './build-skill-brief.ts';
import { buildSkillPointer } from './build-skill-pointer.ts';
import { pickDesignVariant } from './pick-design-variant.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
import { readBriefIssue } from './read-brief-issue.ts';
import { readBriefTemplate } from './read-brief-template.ts';
import { readPermissionTable } from './read-permission-table.ts';
import { readRecordLine } from './read-record-line.ts';
import { readRefFile } from './read-ref-file.ts';
import { readRefSHA } from './read-ref-sha.ts';
import type { BriefDeps, BriefIssue, BriefSkill, SkillBriefInput } from './types.ts';

// Fills the design or PR-walk brief for one Linear issue and prints it, with a pointer to the hq
// skill its agent reads first. A design issue without the `with-geoff` label takes the agent
// variant, which also reads the record line and the permission table from hq-private. It reads
// Linear, GitHub and hq-private, and writes nothing.
export async function runSkillBriefCommand(deps: Pick<BriefDeps, 'linear' | 'run' | 'files' | 'privateDir'>, input: SkillBriefInput): Promise<Out> {
  const issue = await readBriefIssue(deps.linear, input.issue);
  const sha = await readRefSHA(deps.run, input.ref);
  const variant = input.kind === 'design' ? pickDesignVariant(issue) : null;
  if (variant?.kind === 'refused') {
    throw new HqError('bad_state', variant.message);
  }
  if (variant?.kind === 'agent') {
    const template = await readBriefTemplate(deps.run, sha, 'agent-kit/agent-design-brief.md');
    const playbook = buildPlaybook('design', sha);
    if ((await readRefFile(deps.run, sha, playbook.path)) === null) {
      throw new HqError('not_found', `${playbook.path} is missing at ${sha}`);
    }
    const skill = await requireSkill(deps, input.kind, sha);
    const extraActions = pickExtraDesignActions(issue);
    const permissionTable = extraActions.length > 0 ? readPermissionTable(deps.files, deps.privateDir) : [];
    return buildAgentDesignBrief({ issue, sha, template, skill, playbook, recordLine: readRecordLine(deps.files, deps.privateDir, issue.identifier), extraActions, permissionTable });
  }
  const template = await readBriefTemplate(deps.run, sha, `agent-kit/${input.kind}-brief.md`);
  const skill = await requireSkill(deps, input.kind, sha);
  const out = buildSkillBrief({ issue, sha, kind: input.kind, template, skill, repo: template.includes('{{repo}}') ? requireRepo(issue, input.repo) : null });
  return { ...out, data: { ...out.data, variant: variant === null ? null : variant.kind } };
}

async function requireSkill(deps: Pick<BriefDeps, 'run'>, kind: SkillBriefInput['kind'], sha: string): Promise<BriefSkill> {
  const skill = buildSkillPointer(kind, sha);
  if ((await readRefFile(deps.run, sha, skill.path)) === null) {
    throw new HqError('not_found', `${skill.path} is missing at ${sha}`);
  }
  return skill;
}

// A design or PR-walk issue often has no area label, so its repo is needed only when the template names it.
function requireRepo(issue: BriefIssue, chosen: string | null): string {
  const picked = pickIssueRepo(issue, chosen);
  if (picked.kind === 'refused') {
    throw new HqError(picked.code, picked.message);
  }
  return `zgeoff/${picked.area.repo}`;
}
