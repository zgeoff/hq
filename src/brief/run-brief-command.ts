import { join } from 'node:path';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { buildDeliveryBrief } from './build-delivery-brief.ts';
import { REVIEW_LINES_PATH } from './build-review-pointer.ts';
import { findFencedBlock } from './find-fenced-block.ts';
import { pickBriefReads } from './pick-brief-reads.ts';
import { pickIssueRepo } from './pick-issue-repo.ts';
import { readBriefIssue } from './read-brief-issue.ts';
import { readBriefTemplate } from './read-brief-template.ts';
import { readPermissionTable } from './read-permission-table.ts';
import { readRefFile } from './read-ref-file.ts';
import { readRefSHA } from './read-ref-sha.ts';
import { requireGoalFileTarget } from './require-goal-file-target.ts';
import type { BriefDeps, BriefInput } from './types.ts';

const BRIEFS_PATH = 'skills/delivery-lead/references/briefs.md';
const TEMPLATE_PATH = 'agent-kit/brief.md';

// Fills the delivery launch brief for one Linear issue and prints it. It reads Linear, GitHub and
// the private wording, and writes nothing but the goal file: the --goal-file file, or the one in
// the briefs folder when cut 1 moves the issue out of the prompt.
export async function runBriefCommand(deps: BriefDeps, input: BriefInput): Promise<Out> {
  if (input.goalFile !== null) {
    requireGoalFileTarget(deps.files, input.goalFile);
  }
  const issue = await readBriefIssue(deps.linear, input.issue);
  const sha = await readRefSHA(deps.run, input.ref);
  const picked = pickIssueRepo(issue, input.repo);
  if (picked.kind === 'refused') {
    throw new HqError(picked.code, picked.message);
  }
  const reads = pickBriefReads(issue, { area: picked.area, others: picked.others, imp: input.imp }, deps.noslop, sha);
  const template = await readBriefTemplate(deps.run, sha, TEMPLATE_PATH);
  const permissionTable = readPermissionTable(deps.files, deps.privateDir);
  const playbookText = reads.playbook === null ? null : await readRefFile(deps.run, sha, reads.playbook.path);
  const stack = reads.stack ? await readBlock(deps.run, sha, BRIEFS_PATH, 'The stack line:') : '';
  const impLine = reads.imp ? await readBlock(deps.run, sha, BRIEFS_PATH, 'The imp line:') : '';
  if (reads.reviewLines && (await readRefFile(deps.run, sha, REVIEW_LINES_PATH)) === null) {
    throw new HqError('not_found', `${REVIEW_LINES_PATH} is missing at ${sha}`);
  }
  const movedGoalFile = join(deps.briefsDir, `${issue.identifier}.md`);
  const brief = buildDeliveryBrief({ input, issue, sha, reads, template, permissionTable, playbookText, stack, impLine, movedGoalFile });
  for (const warning of brief.warnings) {
    deps.warn(warning);
  }
  if (brief.goalFile?.path === movedGoalFile) {
    deps.files.makeDir(deps.briefsDir);
    requireGoalFileTarget(deps.files, movedGoalFile);
  }
  if (brief.goalFile !== null) {
    deps.files.writeText(brief.goalFile.path, brief.goalFile.text);
  }
  return brief.out;
}

async function readBlock(run: Runner, sha: string, path: string, marker: string): Promise<string> {
  const text = await readRefFile(run, sha, path);
  if (text === null) {
    throw new HqError('not_found', `${path} is missing at ${sha}`);
  }
  const block = findFencedBlock(text, marker);
  if (block === null) {
    throw new HqError('not_found', `${path} at ${sha} has no ${marker}`);
  }
  return block;
}
