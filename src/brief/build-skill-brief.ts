import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { fillPlaceholders } from './fill-placeholders.ts';
import { BRIEF_LIMIT_BYTES } from './fit-brief.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
import type { BriefIssue, BriefSkill, SkillBriefKind } from './types.ts';

export interface SkillBriefFacts {
  issue: BriefIssue;
  sha: string;
  kind: SkillBriefKind;
  template: string;
  skill: BriefSkill;
  repo: string | null;
}

// The design or PR-walk brief from what hq read: the template filled, then the skill pointer. A
// brief over the limit is refused, since it has nothing to cut.
export function buildSkillBrief(facts: SkillBriefFacts): Out {
  // a design or PR-walk issue often has no area label, so its repo is needed only when the template names it
  const repo = facts.template.includes('{{repo}}') ? `zgeoff/${pickIssueRepo(facts.issue, facts.repo)}` : null;
  const values = repo === null ? { issue_id: facts.issue.identifier } : { repo, issue_id: facts.issue.identifier };
  const filled = fillPlaceholders(facts.template, values);
  const prompt = `${filled.text}\n\nFirst read the ${facts.skill.name} skill: ${facts.skill.command}`;
  const bytes = Buffer.byteLength(prompt);
  if (bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${bytes} bytes, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes, cuts: [] });
  }
  return {
    data: { issue: facts.issue.identifier, repo, ref: facts.sha, prompt, bytes, cuts: [], playbook: null, goalFile: null, unfilled: filled.unknown.map((name) => `placeholder:${name}`), kind: facts.kind, skill: facts.skill },
    text: prompt,
  };
}
