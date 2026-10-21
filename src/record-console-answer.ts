import type { Database } from 'bun:sqlite';
import type { Ask } from './asks/types.ts';
import { answerAsk } from './asks/answer-ask.ts';
import { getAsk } from './asks/get-ask.ts';
import { openAsk } from './asks/open-ask.ts';
import { openItem } from './asks/open-item.ts';
import { logEvent } from './log-event.ts';
import { HqError } from './errors.ts';
import { formatConsoleAnswer } from './format-console-answer.ts';
import { enqueue } from './outbox/enqueue.ts';
import { recordUnopenedAnswer } from './record-unopened-answer.ts';
import { roleName } from './roles/role-name.ts';

export interface ConsoleAnswerInput {
  id: string;
  option: string;
  note: string;
  actor: string;
}

// Records the owner's console answer in one write transaction: opened then answered, as the CLI does,
// or answered unopened while another item is open with the owner. The owner session gets one message,
// `console answer: <kind> <id>: <answer>`, through the outbox.
export function recordConsoleAnswer(db: Database, input: ConsoleAnswerInput): Ask {
  return db
    .transaction((): Ask => {
      const before = requireAsk(db, input.id),
        text = formatConsoleAnswer(checkOption(before, input.option), input.note);
      if (before.state === 'open') {
        return recordAnswerMessage(db, answerAsk(db, { id: before.id, kind: before.kind, answer: text, actor: input.actor }), text, input.actor);
      }
      if (openItem(db) !== null) {
        return recordAnswerMessage(db, recordUnopenedAnswer(db, before.id, text, input.actor), text, input.actor);
      }
      openAsk(db, { id: before.id, force: true, actor: input.actor });
      return recordAnswerMessage(db, answerAsk(db, { id: before.id, kind: before.kind, answer: text, actor: input.actor }), text, input.actor);
    })
    .immediate();
}

function recordAnswerMessage(db: Database, after: Ask, answer: string, actor: string): Ask {
  const seq = logEvent(db, 'ask', after.id, 'console-answer', actor, null, null, { answer, title: after.title });
  enqueue(db, seq, roleName('owner'), `console answer: ${after.kind} ${after.id}: ${answer}`);
  return after;
}

function requireAsk(db: Database, id: string): Ask {
  const a = getAsk(db, id);
  if (a === null) {
    throw new HqError('not_found', `no call or proposal with id ${id}`);
  }
  return a;
}

// An option must be one the item offers; a free-text item offers none, so it takes a note only.
function checkOption(a: Ask, option: string): string {
  const labels = (a.item?.options ?? []).map((o) => o.label);
  if (option !== '' && !labels.includes(option)) {
    throw new HqError('bad_args', `${a.id} has no option "${option}"`);
  }
  return option;
}
