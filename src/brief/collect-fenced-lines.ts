import { isClosingFence } from './is-closing-fence.ts';
import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';

export function collectFencedLines(lines: readonly string[]): boolean[] {
  let opening: FenceLine | null = null;
  return lines.map((line) => {
    if (opening === null) {
      opening = parseFenceLine(line);
      return opening !== null;
    }
    if (isClosingFence(opening, line)) {
      opening = null;
    }
    return true;
  });
}
