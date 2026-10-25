import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { Mark } from '../marks/mark-kinds.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { readGrantAdd } from './read-grant-add.ts';
import type { MainGrant } from './read-main-grants.ts';
import { readMainGrants } from './read-main-grants.ts';

// The grant marks one pass added, and the grants still without one.
export interface GrantMarkSync {
  added: Mark[];
  unmarked: MainGrant[];
}

// Gives each grant on hq-private's main its named mark, at the time and PR of the add in force. A
// name a mark carries already is left alone; a grant whose add names no PR stays unmarked.
export function syncGrantMarks(db: Database, directory: string, actor: string): GrantMarkSync {
  const sync: GrantMarkSync = { added: [], unmarked: [] };
  for (const grant of listUnmarkedGrants(db, readMainGrants(directory))) {
    const add = readGrantAdd(directory, grant);
    if (add === null) {
      sync.unmarked.push(grant);
      continue;
    }
    sync.added.push(createGrantMark(db, { text: `${grant.session}'s ${grant.label} grant (grants/${grant.session}.yaml)`, ref: add.ref, at: add.at, name: grant.name, actor }));
  }
  return sync;
}

const NamedMarkSchema = z.array(z.object({ grant_name: z.string() }));

export function listUnmarkedGrants(db: Database, grants: readonly MainGrant[]): MainGrant[] {
  const named = new Set(NamedMarkSchema.parse(db.query('SELECT grant_name FROM marks WHERE grant_name IS NOT NULL').all()).map((row) => row.grant_name));
  return grants.filter((grant) => !named.has(grant.name));
}
