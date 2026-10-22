import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import type { FeedEvent } from './types.ts';

const ROUTED_LABELS = new Set(['decision', 'blocked']);

const RunIssueSchema = z.object({ issue: z.string() }).nullable();

// Queue a decision or blocked note for the orchestrator, inside the caller's transaction.
// An events row keyed on the session and the note's time records each sent
// note, so a restart or a feed reset never sends it twice.
export function sendNoteToOrchestrator(db: Database, event: FeedEvent): boolean {
  if (event.label === undefined || !ROUTED_LABELS.has(event.label) || !event.detail) {
    return false;
  }
  const key = `${event.session}@${new Date(event.at).toISOString()}`;
  if (db.query(`SELECT 1 FROM events WHERE subject = 'run' AND subject_id = ? AND action = 'note-routed'`).get(key)) {
    return false;
  }
  const run = RunIssueSchema.parse(db.query('SELECT issue FROM run_sessions WHERE session_id = ? ORDER BY active DESC, added_at DESC LIMIT 1').get(event.session));
  const issue = run?.issue ?? '(no run)';
  const session = event.name ?? event.session.slice(0, 8);
  const seq = logEvent(db, 'run', key, 'note-routed', 'hq', null, null, { issue: run?.issue ?? null, label: event.label });
  enqueue(db, seq, orchestratorName(), `${event.label} from ${issue} (${session}): ${event.detail}`);
  return true;
}
