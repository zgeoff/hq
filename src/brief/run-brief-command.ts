import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { pickIssueType } from '../lanes/pick-issue-type.ts';
import { isNoslopListed } from '../noslop/is-noslop-listed.ts';
import { buildGoalPointer } from './build-goal-pointer.ts';
import { buildPermissions } from './build-permissions.ts';
import { buildPlaybook } from './build-playbook.ts';
import { BRIEF_LIMIT_BYTES, fitBrief } from './fit-brief.ts';
import { findFencedBlock } from './find-fenced-block.ts';
import { parseIssueActions } from './parse-issue-actions.ts';
import { parseIssueSections } from './parse-issue-sections.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
import { pickIssueSize } from './pick-issue-size.ts';
import { readBriefIssue } from './read-brief-issue.ts';
import { readBriefTemplate } from './read-brief-template.ts';
import { readPermissionTable } from './read-permission-table.ts';
import { readRefFile } from './read-ref-file.ts';
import { readRefSHA } from './read-ref-sha.ts';
import { requireGoalFileTarget } from './require-goal-file-target.ts';
import type { BriefDeps, BriefInput, BriefIssue, BriefParts, BriefPlaybook } from './types.ts';
import { writeGoalFile } from './write-goal-file.ts';

const ISSUE_SECTIONS = new Set(['outcome', 'context', 'scope', 'acceptance', 'agent notes']);
const REQUIRED_SECTIONS = ['Outcome', 'Scope', 'Acceptance'];
const BRIEFS_PATH = 'skills/delivery-lead/references/briefs.md';
const REVIEW_LINES_PATH = 'agent-kit/review-lines.md';
const TEMPLATE_PATH = 'agent-kit/brief.md';

// Fills the delivery launch brief for one Linear issue and prints it. It reads Linear, GitHub and
// the private wording, and writes nothing but the --goal-file file.
export async function runBriefCommand(deps: BriefDeps, input: BriefInput): Promise<Out> {
  if (input.goalFile !== null) {
    requireGoalFileTarget(input.goalFile);
  }
  const issue = await readBriefIssue(deps.linear, input.issue);
  const repo = pickIssueRepo(issue);
  const sha = await readRefSHA(deps.run, input.ref);
  const template = await readBriefTemplate(deps.run, sha, TEMPLATE_PATH);
  const sections = parseIssueSections(issue.description);
  const issueSections = sections.filter((section) => ISSUE_SECTIONS.has(section.name.toLowerCase()));
  const actions = parseIssueActions(sections);
  const permissions = buildPermissions(actions, readPermissionTable(deps.privateDir), repo);
  const unfilled = [...permissions.unfilled];
  const needsRelease = actions.some((action) => ['deploy', 'infra'].includes(action.toLowerCase()));
  if (needsRelease) {
    unfilled.push('not_yours');
  }
  const playbook = await readPlaybook(deps, issue, sha);
  if (playbook.warning !== null) {
    deps.warn(playbook.warning);
    unfilled.push('playbook');
  }
  if (!input.byLink) {
    unfilled.push(...REQUIRED_SECTIONS.filter((name) => !issueSections.some((section) => section.name.toLowerCase() === name.toLowerCase())).map((name) => `issue:${name}`));
  }
  const size = pickIssueSize(issue.labels);
  const stack = size === 'L' || size === 'XL' ? await readBlock(deps, sha, BRIEFS_PATH, 'The stack line:') : '';
  const impLine = input.imp ? await readBlock(deps, sha, BRIEFS_PATH, 'The imp line:') : '';
  const reviewBlock = isNoslopListed(deps.noslop, 'zgeoff', repo) ? await readBlock(deps, sha, REVIEW_LINES_PATH, null) : '';
  const reviewLines = reviewBlock.replaceAll('<repo>', repo);
  const parts: BriefParts = {
    repo,
    issueID: issue.identifier,
    sections: issueSections,
    permissions: permissions.lines.join('\n'),
    stack,
    fixes: needsRelease ? 'Contributes to' : 'Fixes',
    reviewLines,
    notYours: '',
    impLine,
    goalFile: buildGoalPointer({ issue: issue.identifier, playbook: playbook.found, byLink: input.byLink, goalFile: input.goalFile }),
  };
  const fitted = fitBrief(template, parts, !input.byLink && input.goalFile === null);
  if (fitted.bytes > BRIEF_LIMIT_BYTES) {
    throw new HqError('too_long', `the brief is ${fitted.bytes} bytes after every cut, over the ${BRIEF_LIMIT_BYTES} limit`, { bytes: fitted.bytes, cuts: fitted.cuts });
  }
  unfilled.push(...fitted.unknown.map((name) => `placeholder:${name}`));
  if (input.goalFile !== null) {
    writeGoalFile(input.goalFile, issue.identifier, issueSections, playbook.text);
  }
  return {
    data: { issue: issue.identifier, repo: `zgeoff/${repo}`, ref: sha, prompt: fitted.prompt, bytes: fitted.bytes, cuts: fitted.cuts, playbook: playbook.found, goalFile: input.goalFile, unfilled },
    text: fitted.prompt,
  };
}

interface PlaybookRead {
  found: BriefPlaybook | null;
  text: string | null;
  warning: string | null;
}

async function readPlaybook(deps: BriefDeps, issue: BriefIssue, sha: string): Promise<PlaybookRead> {
  const type = pickIssueType(issue.labels);
  if (type === 'none') {
    return { found: null, text: null, warning: `hq brief: ${issue.identifier} has no Type label, so the brief carries no playbook pointer` };
  }
  const playbook = buildPlaybook(type, sha);
  const text = await readRefFile(deps.run, sha, playbook.path);
  if (text === null) {
    return { found: null, text: null, warning: `hq brief: no ${playbook.path} at ${sha.slice(0, 7)}, so the brief carries no playbook pointer` };
  }
  return { found: playbook, text, warning: null };
}

async function readBlock(deps: BriefDeps, sha: string, path: string, marker: string | null): Promise<string> {
  const text = await readRefFile(deps.run, sha, path);
  const block = text === null ? null : findFencedBlock(text, marker);
  if (block === null) {
    throw new HqError('not_found', `${path} at ${sha} has no ${marker ?? 'text fence'}`);
  }
  return block;
}
