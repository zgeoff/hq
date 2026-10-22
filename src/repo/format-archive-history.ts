import type { ArchiveHistory, ArchiveSide } from './types.ts';

const SIDE_NAMES = { hq: 'hq.db', noslop: "noslop's store" };

function formatSide(history: ArchiveHistory, before: ArchiveSide, after: ArchiveSide | undefined): string[] {
  const rows = before.counts.map((count, index) => {
    const next = after?.counts[index];
    return `  ${`${count.table}.${count.column}`.padEnd(26)} ${history.from} ${count.from} → ${next?.from ?? '?'}   ${history.to} ${count.to} → ${next?.to ?? '?'}`;
  });
  return [`${SIDE_NAMES[before.store]}:`, ...rows, ...before.collisions.map((key) => `  would collide: ${key}`)];
}

// Row counts per table.column, before and after, for each database; for a dry run the after counts
// are what the run would leave.
export function formatArchiveHistory(history: ArchiveHistory): string {
  const backups = history.backups.length > 0 ? [`backups: ${history.backups.join(', ')}`] : [],
    head = history.dryRun ? `Dry run: nothing changed. Re-keying ${history.from} → ${history.to} would leave:` : `Re-keyed ${history.from} → ${history.to}:`,
    sides = history.before.flatMap((side) => formatSide(history, side, history.after.find((next) => next.store === side.store)));
  return [head, ...sides, ...backups].join('\n');
}
