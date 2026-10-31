import { isClosingFence } from './is-closing-fence.ts';
import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';

// The body of the first `text` fence at or after the marker line (the first one when the marker
// is null), without the fences; null when the text has no marker or no closed such fence after it.
// A `text` fence inside another fence is that fence's text.
export function findFencedBlock(text: string, marker: string | null): string | null {
  const from = marker === null ? 0 : text.indexOf(marker);
  if (from === -1) {
    return null;
  }
  const lines = text.slice(from).split('\n');
  let opening: { fence: FenceLine; index: number } | null = null;
  for (const [index, line] of lines.entries()) {
    if (opening === null) {
      const fence = parseFenceLine(line);
      opening = fence === null ? null : { fence, index };
    } else if (isClosingFence(opening.fence, line)) {
      if (opening.fence.info === 'text') {
        return lines.slice(opening.index + 1, index).join('\n');
      }
      opening = null;
    }
  }
  return null;
}
