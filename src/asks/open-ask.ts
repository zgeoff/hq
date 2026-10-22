import type { Database } from 'bun:sqlite';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { AskState } from '../transitions/ask-states.ts';
import { ASK_TRANSITIONS } from '../transitions/ask-transitions.ts';
import { checkAsk } from '../transitions/check-ask.ts';
import { currentHold } from './current-hold.ts';
import { getAsk } from './get-ask.ts';
import { nextEligible } from './next-eligible.ts';
import { openItem } from './open-item.ts';
import { requireAsk as mustGet } from './require-ask.ts';
import type { Ask, Kind } from './types.ts';

export function openAsk(db: Database, opts: { kind?: Kind; id?: string; force: boolean; actor: string }): Ask {
  return db
    .transaction((): Ask => {
      const open = openItem(db);
      if (open) {
        throw new HqError('already_open', `${open.kind} ${open.id} is open with the owner: settle it first`, { open: open.id });
      }
      if (!opts.force) {
        if (isQuiet(now())) {
          throw new HqError('quiet_hours', 'quiet hours (03:00-07:00 Sydney). Use --force if the owner is clearly around.');
        }
        const hold = currentHold(db);
        if (hold) throw new HqError('held', `queue held: ${hold.reason}. hq release, or --force.`);
      }
      let a: Ask | null;
      if (opts.id) {
        a = mustGet(db, opts.id, opts.kind);
        const due = a.state === 'later' && a.due_at !== null && a.due_at <= iso(now());
        if (!(ASK_TRANSITIONS.opened.from as readonly AskState[]).includes(a.state) || (a.state === 'later' && !due && !opts.force)) {
          throw new HqError('bad_state', `${a.id} is ${a.state}${a.due_at ? ` until ${a.due_at}` : ''}: only queued or due items open`);
        }
      } else {
        a = nextEligible(db, opts.kind);
        if (!a) throw new HqError('empty', `no ${opts.kind ?? 'call or proposal'} waiting. Quiet at HQ.`);
      }
      checkAsk(a.id, 'opened', a.state);
      const t = iso(now());
      db.query(`UPDATE asks SET state='open', opened_at=?, due_at=NULL, updated_at=? WHERE id=?`).run(t, t, a.id);
      logEvent(db, 'ask', a.id, 'opened', opts.actor, a.state, 'open');
      return getAsk(db, a.id)!;
    })
    .immediate();
}
