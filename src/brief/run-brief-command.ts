import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { buildDeliveryBrief } from './build-delivery-brief.ts';
import { findFencedBlock } from './find-fenced-block.ts';
import { pickBriefReads } from './pick-brief-reads.ts';
import { readBriefIssue } from './read-brief-issue.ts';
import { readBriefTemplate } from './read-brief-template.ts';
import { readPermissionTable } from './read-permission-table.ts';
import { readRefFile } from './read-ref-file.ts';
import { readRefSHA } from './read-ref-sha.ts';
import { requireGoalFileTarget } from './require-goal-file-target.ts';
import type { BriefDeps, BriefInput } from './types.ts';

const BRIEFS_PATH = 'skills/delivery-lead/references/briefs.md';
const REVIEW_LINES_PATH = 'agent-kit/review-lines.md';
const TEMPLATE_PATH = 'agent-kit/brief.md';

// Fills the delivery launch brief for one Linear issue and prints it. It reads Linear, GitHub and
// the private wording, and writes nothing but the --goal-file file.
export async function runBriefCommand(deps: BriefDeps, input: BriefInput): Promise<Out> {
  if (input.goalFile !== null) {
    requireGoalFileTarget(deps.files, input.goalFile);
  }
  const issue = await readBriefIssue(deps.linear, input.issue);
  const sha = await readRefSHA(deps.run, input.ref);
  const reads = pickBriefReads(issue, input, deps.noslop, sha);
  const template = await readBriefTemplate(deps.run, sha, TEMPLATE_PATH);
  const permissionTable = readPermissionTable(deps.files, deps.privateDir);
  const playbookText = reads.playbook === null ? null : await readRefFile(deps.run, sha, reads.playbook.path);
  const stack = reads.stack ? await readBlock(deps.run, sha, BRIEFS_PATH, 'The stack line:') : '';
  const impLine = reads.imp ? await readBlock(deps.run, sha, BRIEFS_PATH, 'The imp line:') : '';
  const reviewBlock = reads.reviewLines ? await readBlock(deps.run, sha, REVIEW_LINES_PATH, null) : '';
  const brief = buildDeliveryBrief({ input, issue, sha, reads, template, permissionTable, playbookText, stack, impLine, reviewBlock });
  for (const warning of brief.warnings) {
    deps.warn(warning);
  }
  if (brief.goalFile !== null) {
    deps.files.writeText(brief.goalFile.path, brief.goalFile.text);
  }
  return brief.out;
}

async function readBlock(run: Runner, sha: string, path: string, marker: string | null): Promise<string> {
  const text = await readRefFile(run, sha, path);
  if (text === null) {
    throw new HqError('not_found', `${path} is missing at ${sha}; pass --ref refactor/fleet-skill-rebuild until the skill rebuild merges`);
  }
  const block = findFencedBlock(text, marker);
  if (block === null) {
    throw new HqError('not_found', `${path} at ${sha} has no ${marker ?? 'text fence'}`);
  }
  return block;
}
