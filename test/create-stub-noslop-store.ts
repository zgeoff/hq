import { Database } from 'bun:sqlite';

export interface StubNoslopStore {
  migrations: string[];
  tables: Record<string, number>;
}

// A store file in noslop's shape: a kysely_migration table holding the applied names and invented
// tables holding the given number of rows each.
export function createStubNoslopStore(path: string, store: StubNoslopStore): void {
  const db = new Database(path, { create: true });
  db.run('CREATE TABLE kysely_migration (name TEXT PRIMARY KEY, timestamp TEXT NOT NULL)');
  for (const name of store.migrations) {
    db.query('INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)').run(name, '2026-10-01T00:00:00.000Z');
  }
  for (const [table, rows] of Object.entries(store.tables)) {
    db.run(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, note TEXT)`);
    for (let id = 1; id <= rows; id += 1) {
      db.query(`INSERT INTO "${table}" (id, note) VALUES (?, ?)`).run(id, `note ${id}`);
    }
  }
  db.close();
}
