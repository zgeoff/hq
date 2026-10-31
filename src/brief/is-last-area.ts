import { parseIssueSections } from './parse-issue-sections.ts';

export function isLastArea(description: string, otherAreas: readonly string[]): boolean {
  const scope = parseIssueSections(description).find((section) => section.name.toLowerCase() === 'scope')?.text ?? '';
  const lines = scope.split('\n');
  return otherAreas.every((area) => lines.some((line) => new RegExp(`^\\s*[-*] \\[[xX]\\] \`?${area}\`?($|[\\s:#,.)])`, 'iu').test(line)));
}
