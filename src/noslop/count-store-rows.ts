import { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';

// The row count of every table in the store, by table name, read without writing to the store.
export function countStoreRows(store: string): Record<string, number> {
  try {
    const db = new Database(store, { readonly: true });
    try {
      const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      return Object.fromEntries(tables.map((table) => [table.name, db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM "${table.name.replaceAll('"', '""')}"`).get()?.n ?? 0]));
    } finally {
      db.close();
    }
  } catch (error) {
    throw new HqError('store_unreadable', `hq cannot count the rows of the store: ${store}: ${(error as Error).message}`);
  }
}
