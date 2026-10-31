import { writeFileSync } from 'node:fs';
import type { IssueSection } from './types.ts';

// The file a relaunch reads: the issue's sections whole, then the playbook when there is one.
export function writeGoalFile(path: string, issue: string, sections: readonly IssueSection[], playbook: string | null): void {
  const parts = [`# ${issue}`, ...sections.map((section) => section.text), ...(playbook === null ? [] : [`---\n\n${playbook.trim()}`])];
  writeFileSync(path, `${parts.join('\n\n')}\n`);
}
