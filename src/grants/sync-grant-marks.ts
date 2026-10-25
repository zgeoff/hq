import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { Mark } from '../marks/mark-kinds.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { readGrantAdd } from './read-grant-add.ts';
import type { MainGrant } from './read-main-grants.ts';
import { readMainGrants } from './read-main-grants.ts';

interface RejectedGrant {
  grant: MainGrant;
  reason: string;
}

// The grant marks one pass added, the grants whose add names no PR, and the grants hq refused to
// mark, with why.
export interface GrantMarkSync {
  added: Mark[];
  unmarked: MainGrant[];
  rejected: RejectedGrant[];
}

// Gives each grant on hq-private's main its named mark, at the time and PR of the add in force. A
// name a mark carries already is left alone; a grant whose add names no PR stays unmarked. One
// refused grant never stops the rest.
export function syncGrantMarks(db: Database, directory: string, actor: string): GrantMarkSync {
  const sync: GrantMarkSync = { added: [], unmarked: [], rejected: [] };
  for (const grant of listUnmarkedGrants(db, readMainGrants(directory))) {
    try {
      const add = readGrantAdd(directory, grant);
      if (add === null) {
        sync.unmarked.push(grant);
        continue;
      }
      sync.added.push(createGrantMark(db, { text: `${grant.session}'s ${grant.label} grant (grants/${grant.session}.yaml)`, ref: add.ref, at: add.at, name: grant.name, actor }));
    } catch (error) {
      sync.rejected.push({ grant, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return sync;
}

const NamedMarkSchema = z.array(z.object({ grant_name: z.string() }));

export function listUnmarkedGrants(db: Database, grants: readonly MainGrant[]): MainGrant[] {
  const named = new Set(NamedMarkSchema.parse(db.query('SELECT grant_name FROM marks WHERE grant_name IS NOT NULL').all()).map((row) => row.grant_name));
  return grants.filter((grant) => !named.has(grant.name));
}
