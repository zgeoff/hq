import type { IssueSection } from './types.ts';

// The file a relaunch reads: the issue's sections whole, then the playbook when there is one.
export function buildGoalFileText(issue: string, sections: readonly IssueSection[], playbook: string | null): string {
  const parts = [`# ${issue}`, ...sections.map((section) => section.text), ...(playbook === null ? [] : [`---\n\n${playbook.trim()}`])];
  return `${parts.join('\n\n')}\n`;
}
