import { fillPlaceholders } from './fill-placeholders.ts';
import type { BriefParts, IssueSection } from './types.ts';

const CUT_2_SECTIONS = new Set(['context', 'agent notes']);

// Fills the template and cuts it to the limit in the order of briefs.md's Length section: cut 1
// moves the issue out (so unavailable when it is in the prompt), cut 2 drops the issue's Context
// and Agent notes, cut 3 drops the /goal line. `unknown` names the placeholders hq has no value for.
export function fitBrief(template: string, parts: BriefParts, issueInPrompt: boolean): { prompt: string; bytes: number; cuts: string[]; unknown: string[] } {
  const cuts: string[] = [];
  let sections: IssueSection[] = issueInPrompt ? parts.sections : [];
  let prompt = fillPlaceholders(template, buildValues(parts, sections)).text;
  if (isOver(prompt) && issueInPrompt) {
    cuts.push('cut 1 unavailable');
  }
  if (isOver(prompt)) {
    const kept = sections.filter((section) => !CUT_2_SECTIONS.has(section.name.toLowerCase()));
    if (kept.length !== sections.length) {
      sections = kept;
      prompt = fillPlaceholders(template, buildValues(parts, sections)).text;
      cuts.push('cut 2');
    }
  }
  if (isOver(prompt)) {
    prompt = dropGoalLine(prompt, parts.goalFile);
    cuts.push('cut 3');
  }
  return { prompt, bytes: Buffer.byteLength(prompt), cuts, unknown: fillPlaceholders(template, buildValues(parts, sections)).unknown };
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

// briefs.md's cut 3 drops the /goal line, but the pointer to the issue and playbook has no other
// place in the prompt, so it takes that line's place.
function dropGoalLine(prompt: string, pointer: string): string {
  const rest = prompt.split('\n').slice(1);
  return (pointer === '' ? rest : [pointer.replace(/^\. /u, ''), ...rest]).join('\n');
}
