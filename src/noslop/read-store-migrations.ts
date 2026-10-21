import { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';

// The migration names the store holds, read from kysely_migration without writing to the store.
export function readStoreMigrations(store: string): string[] {
  try {
    const db = new Database(store, { readonly: true });
    try {
      return db.query<{ name: string }, []>('SELECT name FROM kysely_migration ORDER BY name').all().map((row) => row.name);
    } finally {
      db.close();
    }
  } catch (error) {
    throw new HqError('store_unreadable', `hq cannot read the migrations the store holds: ${store}: ${(error as Error).message}`);
  }
}
