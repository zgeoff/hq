import type { Database } from 'bun:sqlite';
import { addUnblock } from '../src/unblock/add-unblock.ts';
import type { DoneWhen } from '../src/unblock/types.ts';

export interface UnblockItemSeed {
  task: string;
  doneWhen?: DoneWhen[];

  // With links, the console's fields are stored too, as `--item` stores them.
  links?: { label: string; url: string; subject?: true }[];
}

// Files each item as z-triage would: open, added by kettle-triage, telling kettle-session when done.
export function createUnblockItems(db: Database, items: Record<string, UnblockItemSeed>): Database {
  for (const [id, { task, links, doneWhen }] of Object.entries(items)) {
    addUnblock(db, { id, task, minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage', ...(doneWhen ? { doneWhen } : {}) });
    if (links) {
      db.query('UPDATE unblocks SET item = ? WHERE id = ?').run(JSON.stringify({ details: [], unblocks: [], links }), id);
    }
  }
  return db;
}
