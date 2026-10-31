import type { FenceLine } from './parse-fence-line.ts';
import { parseFenceLine } from './parse-fence-line.ts';

// A line closes the fence that `opening` opened only with the same marker, a run at least as long,
// and no info string.
export function isClosingFence(opening: FenceLine, line: string): boolean {
  const fence = parseFenceLine(line);
  return fence !== null && fence.marker === opening.marker && fence.length >= opening.length && fence.info === '';
}
