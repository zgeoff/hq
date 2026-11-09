import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type RefusalFileRow = Selectable<HqTables['refusal_files']>;

export function writeRefusalFile(db: Database, file: RefusalFileRow): void {
  db.query(
    'INSERT INTO refusal_files (path, offset, size, mtime, tools) VALUES (?, ?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET offset = excluded.offset, size = excluded.size, mtime = excluded.mtime, tools = excluded.tools',
  ).run(file.path, file.offset, file.size, file.mtime, file.tools);
}
