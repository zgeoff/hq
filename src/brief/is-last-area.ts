import type { BriefArea } from './pick-brief-areas.ts';
import { readScopeLines } from './read-scope-lines.ts';

export function isLastArea(description: string, otherAreas: readonly BriefArea[]): boolean {
  const lines = readScopeLines(description);
  return otherAreas.every((area) => {
    const names = [area.label, area.repo].map((name) => RegExp.escape(name)).join('|');
    const box = new RegExp(`^\\s*(?:[-*+]|\\d+[.)]) \\[[xX]\\] \`?(?:${names})\`?($|[\\s:#,.)])`, 'iu');
    return lines.some((line) => box.test(line));
  });
}
