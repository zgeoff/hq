import { parseIssueSections } from './parse-issue-sections.ts';

export function isLastArea(description: string, otherAreas: readonly string[]): boolean {
  const scope = parseIssueSections(description).find((section) => section.name.toLowerCase() === 'scope')?.text ?? '';
  const ticked = scope.split('\n').filter((line) => /^\s*[-*] \[[xX]\] /u.test(line));
  return otherAreas.every((area) => ticked.some((line) => new RegExp(`(^|[^a-z0-9-])${area}($|[^a-z0-9-])`, 'iu').test(line)));
}
