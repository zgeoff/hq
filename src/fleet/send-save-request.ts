import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import type { RestartCause } from './types.ts';

const ASK = 'hq restarts you from main once you have saved your state. Save it now, then answer this message with the atc answer tool: `saved`, or `busy` to defer.';

export function sendSaveRequest(db: Database, name: string, sessionId: string, cause: RestartCause): number {
  const reason = match(cause)
    .with({ kind: 'stale' }, (stale) => ({ text: `your start prompt is stale: main has ${stale.latest.commit} (${stale.latest.subject}), which your prompt predates.`, detail: { commit: stale.latest.commit } }))
    .with({ kind: 'scheduled' }, (scheduled) => ({ text: `your scheduled restart is due (${scheduled.why}).`, detail: { reason: scheduled.why } }))
    .exhaustive();
  return db
    .transaction(() => {
      const seq = logEvent(db, 'hq', 'fleet', 'save-requested', 'hq-fleet', null, null, { name, sessionId, ...reason.detail });
      enqueue(db, seq, sessionId, `hq: ${name}, ${reason.text} ${ASK}`);
      return seq;
    })
    .immediate();
}
