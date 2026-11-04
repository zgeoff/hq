import { fillPlaceholders } from './fill-placeholders.ts';
import type { BriefParts, IssueSection } from './types.ts';

interface FittedBrief {
  prompt: string;
  bytes: number;
  cuts: string[];
  unknown: string[];
  movedIssue: boolean;
}

// GitHub's contents API resolves a 12-character prefix of a commit sha to the same file.
const SHORT_SHA_LENGTH = 12;

export function fitBrief(template: string, parts: BriefParts, movedPointer: string | null, sha: string | null = null): FittedBrief {
  const cuts: string[] = [];
  let fitted = parts;
  let sections: IssueSection[] = movedPointer === null ? [] : parts.sections;
  let prompt = fillPlaceholders(template, buildValues(fitted, sections)).text;

  if (isOver(prompt) && movedPointer !== null && sections.length > 0) {
    fitted = { ...parts, goalFile: movedPointer };
    sections = [];
    prompt = fillPlaceholders(template, buildValues(fitted, sections)).text;
    cuts.push('cut 1');
  }
  let pointer = fitted.goalFile;
  if (isOver(prompt) && sha !== null && prompt.includes(sha)) {
    prompt = prompt.replaceAll(sha, sha.slice(0, SHORT_SHA_LENGTH));
    pointer = pointer.replaceAll(sha, sha.slice(0, SHORT_SHA_LENGTH));
    cuts.push('short refs');
  }
  if (isOver(prompt)) {
    prompt = dropGoalLine(prompt, pointer);
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
    goal_review: parts.goalReview,
  };
}

export const BRIEF_LIMIT_BYTES = 4000;

function isOver(prompt: string): boolean {
  return Buffer.byteLength(prompt) > BRIEF_LIMIT_BYTES;
}

// The pointer to the issue and playbook has no other place in the prompt, so it takes the /goal
// line's place.
function dropGoalLine(prompt: string, pointer: string): string {
  const rest = prompt.split('\n').slice(1);
  return (pointer === '' ? rest : [pointer.replace(/^\. /u, ''), ...rest]).join('\n');
}
