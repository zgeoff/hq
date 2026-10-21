import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { ASK_TRANSITIONS } from '../transitions/ask-transitions.ts';
import { checkAsk } from '../transitions/check-ask.ts';
import { getAsk } from './get-ask.ts';
import { requireAsk as mustGet } from './require-ask.ts';
import { sendNoticeIfOther as notifyIfOther } from './send-notice-if-other.ts';
import type { Ask, AskStep } from './types.ts';

// One named transition: the table's check, the row, the event, and a notice to the filer.
export function updateAskState(db: Database, step: AskStep): Ask {
  const action = step.action,
    actor = step.actor,
    data = step.data,
    id = step.id,
    kind = step.kind,
    notice = step.notice,
    set = step.set;
  return db
    .transaction((): Ask => {
      const a = mustGet(db, id, kind);
      checkAsk(a.id, action, a.state);
      const to = ASK_TRANSITIONS[action].to;
      const t = iso(now());
      const cols = Object.keys(set);
      db.query(`UPDATE asks SET state=?, ${cols.map((c) => `${c}=?`).join(', ')}${cols.length ? ',' : ''} updated_at=? WHERE id=?`).run(
        to,
        ...cols.map((c) => set[c]!),
        t,
        a.id,
      );
      const seq = logEvent(db, 'ask', a.id, action, actor, a.state, to, data);
      const after = getAsk(db, a.id)!;
      const text = notice?.(after);
      if (text) {
        notifyIfOther(db, { seq, target: after.filed_by, actor, text });
      }
      return after;
    })
    .immediate();
}
