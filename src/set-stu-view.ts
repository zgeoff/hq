import type { Database } from 'bun:sqlite';
import type { Ask, Kind } from './asks/types.ts';
import { getAsk } from './asks/get-ask.ts';
import { logEvent } from './log-event.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { HqError } from './errors.ts';

export interface StuViewInput {
  id: string;
  kind: Kind;
  view: string;
  actor: string;
}

// `hq call|proposal stu <id> --view`: the owner's one or two sentences, shown first in the details.
export function setStuView(db: Database, input: StuViewInput): Ask {
  if (input.view.trim() === '') {
    throw new HqError('bad_args', '--view must not be empty');
  }
  return db
    .transaction((): Ask => {
      const a = requireAsk(db, input.id, input.kind);
      db.query('UPDATE asks SET stu_view = ?, updated_at = ? WHERE id = ?').run(input.view, iso(now()), a.id);
      logEvent(db, 'ask', a.id, 'stu-view', input.actor, a.state, a.state, { view: input.view });
      return requireAsk(db, a.id);
    })
    .immediate();
}

function requireAsk(db: Database, id: string, kind?: Kind): Ask {
  const a = getAsk(db, id);
  if (a === null || (kind !== undefined && a.kind !== kind)) {
    throw new HqError('not_found', `no ${kind ?? 'call or proposal'} with id ${id}`);
  }
  return a;
}
