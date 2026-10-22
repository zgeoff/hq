import type { StoreMigration } from './run-store-migration.ts';

export function formatStoreMigration(migration: StoreMigration): string {
  if (!migration.hasStore) {
    return `no store migration (no store at ${migration.store})`;
  }
  if (migration.backup === null) {
    return 'no store migration';
  }
  const counts = migration.tables.map((count) => `${count.table} ${count.before} → ${count.after}`).join(', ');
  return `store migration: ${migration.names.join(', ')}; backup ${migration.backup}; ${counts}`;
}
