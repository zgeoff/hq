import { isClosingFence } from './is-closing-fence.ts';
import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';
import { parseIssueSections } from './parse-issue-sections.ts';

export function isLastArea(description: string, otherAreas: readonly string[]): boolean {
  const scope = parseIssueSections(description).find((section) => section.name.toLowerCase() === 'scope')?.text ?? '';
  const lines = collectProseLines(scope);
  return otherAreas.every((area) => lines.some((line) => new RegExp(`^\\s*[-*] \\[[xX]\\] \`?${area}\`?($|[\\s:#,.)])`, 'iu').test(line)));
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
