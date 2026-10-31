import { isClosingFence } from './is-closing-fence.ts';
import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';
import type { BriefArea } from './pick-brief-areas.ts';
import { parseIssueSections } from './parse-issue-sections.ts';

export function isLastArea(description: string, otherAreas: readonly BriefArea[]): boolean {
  const scope = parseIssueSections(description).find((section) => section.name.toLowerCase() === 'scope')?.text ?? '';
  const lines = collectProseLines(scope);
  return otherAreas.every((area) => {
    const names = [area.label, area.repo].map((name) => RegExp.escape(name)).join('|');
    const box = new RegExp(`^\\s*[-*] \\[[xX]\\] \`?(?:${names})\`?($|[\\s:#,.)])`, 'iu');
    return lines.some((line) => box.test(line));
  });
}

function collectProseLines(text: string): string[] {
  const prose: string[] = [];
  let open: FenceLine | null = null;
  for (const line of text.split('\n')) {
    if (open !== null) {
      open = isClosingFence(open, line) ? null : open;
      continue;
    }
    open = parseFenceLine(line);
    if (open === null) {
      prose.push(line);
    }
  }
  return prose;
}
