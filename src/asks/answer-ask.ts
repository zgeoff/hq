import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { owner } from '../owner.ts';
import { requireAsk } from './require-ask.ts';
import type { Ask, Kind } from './types.ts';
import { updateAskState as transition } from './update-ask-state.ts';

export interface AnswerAskInput {
  id: string;
  kind: Kind | undefined;
  answer: string;
  actor: string;
  ownerSession?: boolean;
}

// The owner's exact words. A courtesy note goes to the filer; the answer still
// reaches a blocked session only when z-stu types it there (then `apply`).
export function answerAsk(db: Database, input: AnswerAskInput): Ask {
  const answer = input.answer;
  if (!answer.trim()) {
    throw new HqError('bad_args', 'answer must hold the owner\'s exact words');
  }
  return db
    .transaction(() =>
      transition(db, {
        id: input.id,
        kind: input.kind,
        action: 'answered',
        actor: input.actor,
        set: { answer, answered_at: iso(now()) },
        data: input.ownerSession === true ? { answer, ownerSession: true, title: requireAsk(db, input.id, input.kind).title } : { answer },
        notice: (ask) => `FYI ${ask.kind} ${ask.id} answered by the owner: "${ask.answer}". This note carries no grant: ${owner()} applies the answer.`,
      }),
    )
    .immediate();
}
