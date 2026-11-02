import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { fillPlaceholders } from './fill-placeholders.ts';
import { BRIEF_LIMIT_BYTES } from './fit-brief.ts';
import type { BriefIssue, BriefSkill, SkillBriefKind } from './types.ts';

export interface SkillBriefFacts {
  issue: BriefIssue;
  sha: string;
  kind: SkillBriefKind;
  template: string;
  skill: BriefSkill;

  repo: string | null;
}

export function buildSkillBrief(facts: SkillBriefFacts): Out {
  const values = facts.repo === null ? { issue_id: facts.issue.identifier } : { repo: facts.repo, issue_id: facts.issue.identifier };
  const filled = fillPlaceholders(facts.template, values);
  const prompt = `${filled.text}\n\nFirst read the ${facts.skill.name} skill: ${facts.skill.command}`;
  const bytes = Buffer.byteLength(prompt);
  if (bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${bytes} bytes, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes, cuts: [] });
  }
  return {
    data: { issue: facts.issue.identifier, repo: facts.repo, ref: facts.sha, prompt, bytes, cuts: [], playbook: null, goalFile: null, unfilled: filled.unknown.map((name) => `placeholder:${name}`), kind: facts.kind, skill: facts.skill },
    text: prompt,
  };
}
