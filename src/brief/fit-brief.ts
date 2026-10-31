import type { BriefParts, IssueSection } from './types.ts';

const CUT_2_SECTIONS = new Set(['context', 'agent notes']);
const PLACEHOLDER = /\{\{(?<name>\w+)\}\}/gu;

// Fills the template and cuts it to the limit in the order of briefs.md's Length section: cut 1
// moves the issue out (so unavailable when it is in the prompt), cut 2 drops the issue's Context
// and Agent notes, cut 3 drops the /goal line. `unknown` names the placeholders hq has no value for.
export function fitBrief(template: string, parts: BriefParts, issueInPrompt: boolean): { prompt: string; bytes: number; cuts: string[]; unknown: string[] } {
  const cuts: string[] = [];
  let sections: IssueSection[] = issueInPrompt ? parts.sections : [];
  let prompt = fillTemplate(template, parts, sections);
  if (isOver(prompt) && issueInPrompt) {
    cuts.push('cut 1 unavailable');
  }
  if (isOver(prompt)) {
    const kept = sections.filter((section) => !CUT_2_SECTIONS.has(section.name.toLowerCase()));
    if (kept.length !== sections.length) {
      sections = kept;
      prompt = fillTemplate(template, parts, sections);
      cuts.push('cut 2');
    }
  }
  if (isOver(prompt)) {
    prompt = dropGoalLine(prompt);
    cuts.push('cut 3');
  }
  const names = [...template.matchAll(PLACEHOLDER)].map((match) => match.groups?.['name'] ?? '');
  const known = Object.keys(buildValues(parts, sections));
  return { prompt, bytes: Buffer.byteLength(prompt), cuts, unknown: [...new Set(names.filter((name) => !known.includes(name)))] };
}

// Placeholders are filled in one pass, so text that holds `{{x}}` is never filled again.
function fillTemplate(template: string, parts: BriefParts, sections: readonly IssueSection[]): string {
  const values = buildValues(parts, sections);
  return template.replaceAll(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
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

function dropGoalLine(prompt: string): string {
  return prompt.split('\n').slice(1).join('\n');
}
