// Writes the console's structured fields onto a call or proposal, wrapping addAsk in the same
// transaction.
import type { Database } from 'bun:sqlite';
import type { AddInput, AddResult, Ask } from './asks/types.ts';
import { addAsk } from './asks/add-ask.ts';
import { getAsk } from './asks/get-ask.ts';
import { logEvent } from './log-event.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { HqError } from './errors.ts';
import type { ItemInput } from './parse-item-input.ts';
import { splitItemExtras } from './split-item-extras.ts';

export type AskItemInput = Omit<AddInput, 'title' | 'question' | 'body'>;

// `hq call|proposal add --item`: adds or updates the ask as addAsk does, then stores its fields. A
// note from addAsk (open with the owner, already settled) means its text was left as it was, so its
// fields are too.
export function applyAskItem(db: Database, input: AskItemInput, item: ItemInput, body: string): AddResult {
  return db
    .transaction((): AddResult => {
      const added = addAsk(db, { ...input, title: item.title, question: item.question, body }),
        extras = JSON.stringify(splitItemExtras(item)),
        stuView = item.stuView ?? added.ask.stu_view;
      if (added.note !== undefined) {
        return added;
      }
      if (JSON.stringify(added.ask.item) === extras && added.ask.stu_view === stuView) {
        return added;
      }
      db.query('UPDATE asks SET item = ?, stu_view = ?, updated_at = ? WHERE id = ?').run(extras, stuView, iso(now()), added.ask.id);
      logEvent(db, 'ask', added.ask.id, 'item', input.actor, added.ask.state, added.ask.state, { item: extras });
      return { ask: requireAsk(db, added.ask.id), result: added.result === 'noop' ? 'updated' : added.result };
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
