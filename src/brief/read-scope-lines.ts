import { isClosingFence } from './is-closing-fence.ts';
import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';
import { parseIssueSections } from './parse-issue-sections.ts';

// The Scope section's lines outside any fenced block.
export function readScopeLines(description: string): string[] {
  const scope = parseIssueSections(description).find((section) => section.name.toLowerCase() === 'scope')?.text ?? '';
  const prose: string[] = [];
  let open: FenceLine | null = null;
  for (const line of scope.split('\n')) {
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
