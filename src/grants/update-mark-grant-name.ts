import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { Mark } from '../marks/mark-kinds.ts';
import { getMark } from '../marks/get-mark.ts';
import { countGrantActions } from './count-grant-actions.ts';
import { requireGrantName } from './require-grant-name.ts';
import type { GrantNaming } from './types.ts';

// Names a grant mark, for a standing grant recorded before names, or renames one with no actions
// yet. Only a `grant` mark takes a name, and each name belongs to one mark.
export function updateMarkGrantName(db: Database, naming: GrantNaming): Mark {
  requireGrantName(naming.name);
  return db
    .transaction((): Mark => {
      const mark = requireNameableMark(db, naming);
      db.query('UPDATE marks SET grant_name = ? WHERE id = ?').run(naming.name, naming.id);
      logEvent(db, 'hq', `mark:${naming.id}`, 'grant-named', naming.actor, null, null, { from: mark.grant_name, to: naming.name });
      return { ...mark, grant_name: naming.name };
    })
    .immediate();
}

// A grant mark whose name is free to set: not another mark's, and not a rename that would leave
// recorded actions under a name no mark carries.
function requireNameableMark(db: Database, naming: GrantNaming): Mark {
  const mark = getMark(db, naming.id),
    owner = db.query('SELECT id FROM marks WHERE grant_name = ?').get(naming.name) as { id: number } | null;
  if (mark === null) {
    throw new HqError('not_found', `no mark ${naming.id}`);
  }
  if (mark.kind !== 'grant') {
    throw new HqError('bad_args', `mark ${naming.id} is a ${mark.kind} mark; only a grant mark takes a name`);
  }
  if (owner !== null && owner.id !== naming.id) {
    throw new HqError('conflict', `mark ${owner.id} already has the grant name ${naming.name}`);
  }
  if (mark.grant_name !== null && mark.grant_name !== naming.name && countGrantActions(db, mark.grant_name) > 0) {
    throw new HqError('conflict', `grant ${mark.grant_name} has actions recorded; it keeps its name`);
  }
  return mark;
}
