import { fillPlaceholders } from './fill-placeholders.ts';
import type { BriefParts, IssueSection } from './types.ts';

interface FittedBrief {
  prompt: string;
  bytes: number;
  cuts: string[];
  unknown: string[];

  // whether cut 1 moved the issue out of the prompt, so the caller writes its goal file
  movedIssue: boolean;
}

// Fills the template and cuts it to the limit: cut 1 moves the issue out of the prompt into a goal
// file, and cut 2 drops the /goal line. `movedPointer` is the /goal line's pointer to that file,
// null when the issue is already out of the prompt. `unknown` names the unfilled placeholders.
export function fitBrief(template: string, parts: BriefParts, movedPointer: string | null): FittedBrief {
  const cuts: string[] = [];
  let fitted = parts;
  let sections: IssueSection[] = movedPointer === null ? [] : parts.sections;
  let prompt = fillPlaceholders(template, buildValues(fitted, sections)).text;

  // An issue with no sections has nothing to move, and the pointer would only add bytes.
  if (isOver(prompt) && movedPointer !== null && sections.length > 0) {
    fitted = { ...parts, goalFile: movedPointer };
    sections = [];
    prompt = fillPlaceholders(template, buildValues(fitted, sections)).text;
    cuts.push('cut 1');
  }
  if (isOver(prompt)) {
    prompt = dropGoalLine(prompt, fitted.goalFile);
    cuts.push('cut 2');
  }
  return { prompt, bytes: Buffer.byteLength(prompt), cuts, unknown: fillPlaceholders(template, buildValues(fitted, sections)).unknown, movedIssue: cuts.includes('cut 1') };
}

function buildValues(parts: BriefParts, sections: readonly IssueSection[]): Record<string, string> {
  return {
    repo: `zgeoff/${parts.repo}`,
    issue_id: parts.issueID,
    issue: sections.map((section) => section.text).join('\n\n'),
    permissions: parts.permissions,
    stack: parts.stack,
    fixes: parts.fixes,
    review_lines: parts.reviewLines,
    not_yours: parts.notYours,
    imp_line: parts.impLine,
    goal_file: parts.goalFile,
  };
}

export const BRIEF_LIMIT_BYTES = 4000;

function isOver(prompt: string): boolean {
  return Buffer.byteLength(prompt) > BRIEF_LIMIT_BYTES;
}

// Cut 2 drops the /goal line, but the pointer to the issue and playbook has no other place in the
// prompt, so it takes that line's place.
function dropGoalLine(prompt: string, pointer: string): string {
  const rest = prompt.split('\n').slice(1);
  return (pointer === '' ? rest : [pointer.replace(/^\. /u, ''), ...rest]).join('\n');
}
