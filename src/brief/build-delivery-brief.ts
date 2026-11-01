import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { buildGoalFileText } from './build-goal-file-text.ts';
import { buildGoalPointer } from './build-goal-pointer.ts';
import { buildPermissions } from './build-permissions.ts';
import { buildReviewPointer } from './build-review-pointer.ts';
import { BRIEF_LIMIT_BYTES, fitBrief } from './fit-brief.ts';
import { isLastArea } from './is-last-area.ts';
import { parseIssueActions } from './parse-issue-actions.ts';
import { parseIssueSections } from './parse-issue-sections.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import type { BriefReads } from './pick-brief-reads.ts';
import type { BriefInput, BriefIssue, BriefParts, IssueSection, PermissionRow } from './types.ts';

const ISSUE_SECTIONS = new Set(['outcome', 'context', 'scope', 'acceptance', 'agent notes']);

export interface DeliveryBriefFacts {
  input: BriefInput;
  issue: BriefIssue;
  sha: string;
  reads: BriefReads;
  template: string;
  permissionTable: readonly PermissionRow[];

  // the playbook's text at the sha; null when there is no playbook to read or no file at its path
  playbookText: string | null;
  stack: string;
  impLine: string;

  // where cut 1 writes the issue when a brief that carries it in the prompt is over the limit
  movedGoalFile: string;
}

export interface DeliveryBrief {
  out: Out;
  warnings: string[];
  goalFile: { path: string; text: string } | null;
}

// The delivery brief from what hq read: the filled and fitted prompt, the warnings to print, and
// the goal file to write, at --goal-file or where cut 1 moved the issue. A prompt still over the
// limit after every cut is refused.
export function buildDeliveryBrief(facts: DeliveryBriefFacts): DeliveryBrief {
  const sections = parseIssueSections(facts.issue.description);
  const issueSections = sections.filter((section) => ISSUE_SECTIONS.has(section.name.toLowerCase()));
  const actions = parseIssueActions(sections);
  const permissions = buildPermissions(actions, facts.permissionTable, facts.reads.repo);
  const needsRelease = permissions.names.some((action) => ['deploy', 'infra'].includes(action.toLowerCase()));
  const playbook = facts.playbookText === null ? null : facts.reads.playbook;
  const parts: BriefParts = {
    repo: facts.reads.repo,
    issueID: facts.issue.identifier,
    sections: issueSections,
    permissions: permissions.lines.join('\n'),
    stack: facts.stack,
    fixes: needsRelease || !isLastArea(facts.issue.description, facts.reads.otherAreas) ? 'Contributes to' : 'Fixes',
    reviewLines: facts.reads.reviewLines ? buildReviewPointer(`zgeoff/${facts.reads.repo}`, facts.sha) : '',
    notYours: buildAreaLine(facts.issue.identifier, facts.reads.repo, facts.reads.otherAreas),
    impLine: facts.impLine,
    goalFile: buildGoalPointer({ issue: facts.issue.identifier, playbook, byLink: facts.input.byLink, goalFile: facts.input.goalFile }),
  };
  const issueInPrompt = !facts.input.byLink && facts.input.goalFile === null;
  const movedPointer = issueInPrompt ? buildGoalPointer({ issue: facts.issue.identifier, playbook, byLink: false, goalFile: facts.movedGoalFile }) : null;
  const fitted = fitBrief(facts.template, parts, movedPointer);
  const goalFile = fitted.movedIssue ? facts.movedGoalFile : facts.input.goalFile;
  if (fitted.bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${fitted.bytes} bytes after every cut, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes: fitted.bytes, cuts: fitted.cuts });
  }
  const unfilled = [
    ...permissions.unfilled,
    ...(needsRelease ? ['not_yours'] : []),
    ...(playbook === null ? ['playbook'] : []),
    ...(facts.input.byLink ? [] : collectMissingSections(issueSections)),
    ...fitted.unknown.map((name) => `placeholder:${name}`),
  ];
  return {
    out: {
      data: { issue: facts.issue.identifier, repo: `zgeoff/${facts.reads.repo}`, ref: facts.sha, prompt: fitted.prompt, bytes: fitted.bytes, cuts: fitted.cuts, playbook, goalFile, unfilled },
      text: fitted.prompt,
    },
    warnings: buildPlaybookWarnings(facts),
    goalFile: goalFile === null ? null : { path: goalFile, text: buildGoalFileText(facts.issue.identifier, issueSections, facts.playbookText) },
  };
}

const REQUIRED_SECTIONS = ['Outcome', 'Scope', 'Acceptance'];

// With --repo on a multi-area issue: keep the agent to its own area, since each other gets a launch.
function buildAreaLine(issue: string, repo: string, otherAreas: readonly BriefArea[]): string {
  return otherAreas.length === 0 ? '' : ` Do only the \`${repo}\` part of ${issue}: each other area (${otherAreas.map((area) => area.label).join(', ')}) gets its own launch.`;
}

function collectMissingSections(sections: readonly IssueSection[]): string[] {
  return REQUIRED_SECTIONS.filter((name) => !sections.some((section) => section.name.toLowerCase() === name.toLowerCase())).map((name) => `issue:${name}`);
}

function buildPlaybookWarnings(facts: DeliveryBriefFacts): string[] {
  if (facts.reads.playbook === null) {
    return [`hq brief: ${facts.issue.identifier} has no Type label, so the brief carries no playbook pointer`];
  }
  if (facts.playbookText === null) {
    return [`hq brief: no ${facts.reads.playbook.path} at ${facts.sha.slice(0, 7)}, so the brief carries no playbook pointer`];
  }
  return [];
}
