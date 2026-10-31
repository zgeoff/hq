import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { buildPermissionLines, pickPermissionNames } from './build-permissions.ts';
import { fillPlaceholders } from './fill-placeholders.ts';
import { BRIEF_LIMIT_BYTES } from './fit-brief.ts';
import { parseIssueActions } from './parse-issue-actions.ts';
import { parseIssueSections } from './parse-issue-sections.ts';
import type { BriefIssue, BriefPlaybook, BriefSkill, PermissionRow } from './types.ts';

const CHECK_SKETCHES = 'skills/linear-triage/scripts/check-sketches.sh';

// The design pass's own permissions are the template's fixed text, so these actions add no line.
const OWN_ACTIONS = ['agent design pass', 'design session', 'code delivery'];

export interface AgentDesignBriefFacts {
  issue: BriefIssue;
  sha: string;
  template: string;
  skill: BriefSkill;
  playbook: BriefPlaybook;
  recordLine: string;

  // the issue's actions beyond the design pass (pickExtraDesignActions), and the table that words them
  extraActions: readonly string[];
  permissionTable: readonly PermissionRow[];
}

// The issue's actions beyond the design pass itself, whose permissions the template already states.
export function pickExtraDesignActions(issue: BriefIssue): string[] {
  return parseIssueActions(parseIssueSections(issue.description)).filter((action) => !OWN_ACTIONS.some((own) => action.toLowerCase().startsWith(own)));
}

// The agent design brief from what hq read: the template filled, then the skill pointer. A brief
// over the limit is refused, since it has nothing to cut.
export function buildAgentDesignBrief(facts: AgentDesignBriefFacts): Out {
  const permissions = buildPermissionLines(pickPermissionNames(facts.extraActions, facts.permissionTable), facts.permissionTable, '<repo>');
  const values = {
    issue_id: facts.issue.identifier,
    playbook: facts.playbook.command,
    record_line: facts.recordLine,
    check_sketches: `gh api 'repos/zgeoff/hq/contents/${CHECK_SKETCHES}?ref=${facts.sha}' -H 'Accept: application/vnd.github.raw' > <scratch>/check-sketches.sh`,
    permissions: permissions.lines.map((line) => `\n${line}`).join(''),
  };
  const filled = fillPlaceholders(facts.template, values);
  const prompt = `${filled.text}\n\nFirst read the ${facts.skill.name} skill: ${facts.skill.command}`;
  const bytes = Buffer.byteLength(prompt);
  if (bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${bytes} bytes, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes, cuts: [] });
  }
  const unfilled = [...permissions.unfilled, ...filled.unknown.map((name) => `placeholder:${name}`)];
  return {
    data: { issue: facts.issue.identifier, repo: null, ref: facts.sha, prompt, bytes, cuts: [], playbook: facts.playbook, goalFile: null, unfilled, kind: 'design', variant: 'agent', skill: facts.skill },
    text: prompt,
  };
}
