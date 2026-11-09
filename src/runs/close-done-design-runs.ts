import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { pickDoneDesignRuns } from './pick-done-design-runs.ts';
import { pickSessionsToClose } from './pick-sessions-to-close.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { setState } from './set-state.ts';
import { wrapUpRunSafely } from './wrap-up-merged-runs.ts';

const ISSUES = z.array(z.object({ issue: z.string() }));
const SESSIONS = z.array(z.object({ session_id: z.string() }));

export async function closeDoneDesignRuns(db: Database, deps: WrapUpDeps, actor: string): Promise<string[]> {
  const doneIssues = new Set(ISSUES.parse(db.query("SELECT issue FROM linear_issues WHERE state = 'completed'").all()).map((row) => row.issue));
  const closed: string[] = [];
  for (const issue of pickDoneDesignRuns(readDesignRuns(db), doneIssues)) {
    setState(db, issue, 'done', { note: 'The Design issue is Done in Linear' }, actor);
    closed.push(issue);
    const wrapUp = await wrapUpRunSafely(db, deps, issue, { actor });
    const runSessions = SESSIONS.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ? ORDER BY added_at, session_id').all(issue)).map((row) => row.session_id);
    for (const session of pickSessionsToClose(wrapUp, issue, runSessions)) {
      const seq = logEvent(db, 'run', issue, 'design-done-close-session', actor, null, null, { session });
      enqueue(db, seq, orchestratorName(), `${issue}: its Design issue is Done in Linear, and the run is done. Unpin and stop session ${session}; hq does not stop a pinned session itself.`, null, `hq-design-done-${issue}-${session}`);
    }
  }
  return closed;
}
