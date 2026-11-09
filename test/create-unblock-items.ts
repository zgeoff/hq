import type { Database } from 'bun:sqlite';
import { seedLinkedUnblock } from '../src/unblock/test-utils/seed-linked-unblock.ts';
import { seedUnblock } from '../src/unblock/test-utils/seed-unblock.ts';
import type { DoneWhen } from '../src/unblock/types.ts';

export interface UnblockItemSeed {
  task: string;
  doneWhen?: DoneWhen[];

  links?: { label: string; url: string; subject?: true }[];
}

export function createUnblockItems(db: Database, items: Record<string, UnblockItemSeed>): Database {
  for (const [id, { task, links, doneWhen }] of Object.entries(items)) {
    const input = { id, task, notify: ['kettle-session'], actor: 'kettle-triage', ...(doneWhen ? { doneWhen } : {}) };
    if (links) {
      seedLinkedUnblock({ db }, { ...input, links });
    } else {
      seedUnblock({ db }, input);
    }
  }
  return db;
}
