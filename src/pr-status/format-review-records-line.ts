import { formatHeldFiles } from './format-held-files.ts';
import type { PRStatusView } from './types.ts';

// z-review's records at the head as one line; null when there is none.
export function formatReviewRecordsLine(records: PRStatusView['reviewRecords']): string | null {
  const mechanical = records.mechanical;
  const exemption = records.exemption;
  const parts = [
    mechanical === null ? null : `mechanical edits proved by hq (${mechanical.lines} lines in ${formatHeldFiles(mechanical.files)})`,
    exemption === null ? null : `exempt under the ${exemption.rule} rule, not proved by hq: ${exemption.note}${formatExemptFiles(exemption.files)}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `z-review: ${parts.join('; ')}`;
}

// Every file the exemption covered, so none is cut from the owner's view.
function formatExemptFiles(files: string[]): string {
  return files.length === 0 ? '' : ` (held files: ${files.join(', ')})`;
}
