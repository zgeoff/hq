import type { IssueSection } from './types.ts';

export function buildGoalFileText(issue: string, sections: readonly IssueSection[], playbook: string | null): string {
  const parts = [`# ${issue}`, ...sections.map((section) => section.text), ...(playbook === null ? [] : [`---\n\n${playbook.trim()}`])];
  return `${parts.join('\n\n')}\n`;
}
