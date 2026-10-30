import { formatKilobytes } from './format-kilobytes.ts';
import type { TrimReport } from './types.ts';

export function formatTrimReport(report: TrimReport): string {
  const name = `${report.role}.md`;
  const lines = [`${name}: ${report.beforeBytes} bytes before, ${report.afterBytes} bytes after, ${report.entriesMoved} entries moved`];
  if (report.entriesMoved === 0) {
    const why = report.afterBytes > report.limitBytes ? 'only the newest log entry is left' : `already under the ${formatKilobytes(report.limitBytes)} limit`;
    lines.push(`nothing to move: ${why}`);
  } else {
    lines.push(`archive: ${report.archive}`, `backup: ${report.backup}`);
  }
  if (report.afterBytes > report.limitBytes) {
    lines.push(`still ${formatKilobytes(report.afterBytes - report.limitBytes)} over the limit after the log; trim the other sections by hand`);
  }
  if (report.dryRun) {
    lines.push('dry run: nothing written');
  }
  return lines.join('\n');
}
