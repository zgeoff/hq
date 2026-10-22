import type { Database } from 'bun:sqlite';
import type { Mark } from '../marks/mark-kinds.ts';
import { addMark } from '../marks/add-mark.ts';
import type { GrantMarkInput } from './types.ts';
import { updateMarkGrantName } from './update-mark-grant-name.ts';

// `hq mark add --kind grant --grant NAME`: the grant mark and its name land together, or neither does.
export function createGrantMark(db: Database, input: GrantMarkInput): Mark {
  return db
    .transaction((): Mark => {
      const mark = addMark(db, { kind: 'grant', text: input.text, ref: input.ref, at: input.at, actor: input.actor });
      return updateMarkGrantName(db, { id: mark.id, name: input.name, actor: input.actor });
    })
    .immediate();
}
