import type { Database } from 'bun:sqlite';
import type { Ask } from './asks/types.ts';
import { getAsk } from './asks/get-ask.ts';
import { logEvent } from './log-event.ts';
import { owner } from './owner.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { HqError } from './errors.ts';
import { enqueue } from './outbox/enqueue.ts';
import { checkAsk } from './transitions/check-ask.ts';

// The owner's console answer while another item is open with the owner: this one goes straight to answered,
// its opened_at the answer's time, logged `answered-unopened`; the one-open rule stays as it is.
// The filer hears it as `hq call answer` tells it.
export function recordUnopenedAnswer(db: Database, id: string, answer: string, actor: string): Ask {
  return db
    .transaction((): Ask => {
      const at = iso(now()),
        before = requireAsk(db, id);
      checkAsk(before.id, 'answered-unopened', before.state);
      db.query(`UPDATE asks SET state = 'answered', answer = ?, answered_at = ?, opened_at = ?, due_at = NULL, updated_at = ? WHERE id = ?`).run(answer, at, at, at, before.id);
      return recordFilerNotice(db, before, answer, actor);
    })
    .immediate();
}

function requireAsk(db: Database, id: string): Ask {
  const a = getAsk(db, id);
  if (a === null) {
    throw new HqError('not_found', `no call or proposal with id ${id}`);
  }
  return a;
}

function recordFilerNotice(db: Database, before: Ask, answer: string, actor: string): Ask {
  const after = requireAsk(db, before.id),
    seq = logEvent(db, 'ask', before.id, 'answered-unopened', actor, before.state, 'answered', { answer });
  if (after.filed_by !== null && after.filed_by !== actor) {
    enqueue(db, seq, after.filed_by, `FYI ${after.kind} ${after.id} answered by the owner: "${answer}". This note carries no grant: ${owner()} applies the answer.`);
  }
  return after;
}
