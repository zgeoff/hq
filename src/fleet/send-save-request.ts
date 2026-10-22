import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import type { StaleCommit } from './parse-stale-commit.ts';

export function sendSaveRequest(db: Database, name: string, sessionId: string, commit: StaleCommit): number {
  const text = `hq: ${name}, your start prompt is stale: main has ${commit.commit} (${commit.subject}), which your prompt predates. hq restarts you from main once you have saved your state. Save it now, then answer this message with the atc answer tool: \`saved\`, or \`busy\` to defer.`;
  return db
    .transaction(() => {
      const seq = logEvent(db, 'hq', 'fleet', 'save-requested', 'hq-fleet', null, null, { name, sessionId, commit: commit.commit });
      enqueue(db, seq, sessionId, text);
      return seq;
    })
    .immediate();
}
