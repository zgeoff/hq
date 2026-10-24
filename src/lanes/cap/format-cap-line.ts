import { formatCapUntil } from './format-cap-until.ts';
import type { CapView } from './build-cap-view.ts';
import { formatWorking } from './format-working.ts';

export function formatCapLine(view: CapView): string | null {
  if (view.cap === null) {
    return null;
  }
  const until = view.until === null ? '' : ` until ${formatCapUntil(view.until)} Sydney`;
  const reason = view.reason === null ? '' : ` (${view.reason})`;
  return `cap: ${view.cap}${until}${reason}, ${formatWorking(view)}`;
}
