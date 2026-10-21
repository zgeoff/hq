import type { PaneHeatRow } from '../types';

// Whether `hq pane --json`'s heat map is one the pane can draw. hq's CLI test runs its own output
// through this check, so a change on either side fails there.
export function isHeatList(value: unknown): value is PaneHeatRow[] {
  return Array.isArray(value) && value.every((row: Partial<PaneHeatRow> | null) => typeof row?.lane === 'string' && Number.isInteger(row.size) && Number.isInteger(row.used));
}
