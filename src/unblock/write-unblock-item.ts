import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

export function writeUnblockItem(db: Database, id: string, title: string | null, extras: string): void {
  db.query('UPDATE unblocks SET title = ?, item = ?, updated_at = ? WHERE id = ?').run(title, extras, iso(now()), id);
}
