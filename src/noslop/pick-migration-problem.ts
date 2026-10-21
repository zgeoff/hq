// What is wrong with a migrated store, from the names and row counts read before and after the run:
// a new migration the store does not hold, or a table that lost rows. null when nothing is wrong.
export function pickMigrationProblem(newNames: string[], appliedAfter: string[], countsBefore: Record<string, number>, countsAfter: Record<string, number>): string | null {
  const applied = new Set(appliedAfter),
    dropped = Object.keys(countsBefore).filter((table) => (countsAfter[table] ?? 0) < (countsBefore[table] ?? 0)),
    missing = newNames.filter((name) => !applied.has(name));
  if (missing.length > 0) {
    return `the store does not hold the migration ${missing.join(', ')} after the run`;
  }
  if (dropped.length > 0) {
    return `the migration lost rows: ${dropped.map((table) => `${table} ${countsBefore[table] ?? 0} -> ${countsAfter[table] ?? 0}`).join(', ')}`;
  }
  return null;
}
