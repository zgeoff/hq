import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { buildSkillPointer } from './build-skill-pointer.ts';
import { fillPlaceholders } from './fill-placeholders.ts';
import { BRIEF_LIMIT_BYTES } from './fit-brief.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
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
  // a design or PR-walk issue often has no area label, so its repo is needed only when the template names it
  const repo = template.includes('{{repo}}') ? `zgeoff/${pickIssueRepo(issue)}` : null;
  const skill = buildSkillPointer(input.kind, sha);
  if ((await readRefFile(deps.run, sha, skill.path)) === null) {
    throw new HqError('not_found', `${skill.path} is missing at ${sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges`);
  }
  const filled = fillPlaceholders(template, repo === null ? { issue_id: issue.identifier } : { repo, issue_id: issue.identifier });
  const prompt = `${filled.text}\n\nFirst read the ${skill.name} skill: ${skill.command}`;
  const bytes = Buffer.byteLength(prompt);
  if (bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${bytes} bytes, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes, cuts: [] });
  }
  return {
    data: { issue: issue.identifier, repo, ref: sha, prompt, bytes, cuts: [], playbook: null, goalFile: null, unfilled: filled.unknown.map((name) => `placeholder:${name}`), kind: input.kind, skill },
    text: prompt,
  };
}
