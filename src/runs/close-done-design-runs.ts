import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import { readCompletedIssues } from '../linear/read-completed-issues.ts';
import { logEvent } from '../log-event.ts';
import { enqueueOnce } from '../outbox/enqueue-once.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { getRun } from './get-run.ts';
import { pickDoneDesignRuns } from './pick-done-design-runs.ts';
import { pickSessionsToClose } from './pick-sessions-to-close.ts';
import type { ClaimedSession, SessionToClose } from './pick-sessions-to-close.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { setState } from './set-state.ts';
import type { WrapUp } from './types.ts';
import { wrapUpRunSafely } from './wrap-up-merged-runs.ts';

export interface DesignRunsClose {
  closed: string[];
  errors: string[];
}

// The close and its claim commit together, and the messages wait for the wrap-up's result. A pass
// that dies in between leaves the claim open, and the next pass finishes it.
export async function closeDoneDesignRuns(db: Database, deps: WrapUpDeps, actor: string): Promise<DesignRunsClose> {
  const result: DesignRunsClose = { closed: [], errors: [] };
  for (const issue of pickDoneDesignRuns(readDesignRuns(db), readCompletedIssues(db))) {
    try {
      if (claimDoneDesignRun(db, issue, actor)) {
        result.closed.push(issue);
      }
    } catch (error) {
      result.errors.push(`${issue}: ${toErrorMessage(error)}`);
    }
  }
  for (const claim of readOpenCloseClaims(db)) {
    const wrapUp = await wrapUpRunSafely(db, deps, claim.issue, { actor });
    try {
      writeCloseResult(db, claim, wrapUp, actor);
    } catch (error) {
      result.errors.push(`${claim.issue}: ${toErrorMessage(error)}`);
    }
  }
  return result;
}

const CLAIM_ACTION = 'design-done-close';

const SessionRowsSchema = z.array(z.object({ session_id: z.string(), active: z.number() }));

// A closed run's sessions are all ended, so the claim records which were active before the close.
function claimDoneDesignRun(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      const run = getRun(db, issue);
      if (run === null || CLOSED_RUN_STATES.includes(run.state)) {
        return false;
      }
      const rows = SessionRowsSchema.parse(db.query('SELECT session_id, active FROM run_sessions WHERE issue = ? ORDER BY added_at, session_id').all(issue));
      const sessions: ClaimedSession[] = rows.map((row) => ({ id: row.session_id, active: row.active === 1 }));
      setState(db, issue, 'done', { note: 'The Design issue is Done in Linear' }, actor);
      logEvent(db, 'run', issue, CLAIM_ACTION, actor, null, null, { sessions });
      return true;
    })
    .immediate();
}

interface CloseClaim {
  seq: number;
  issue: string;
  sessions: ClaimedSession[];
}

const ClaimRowsSchema = z.array(z.object({ seq: z.number(), issue: z.string(), data: z.string() }));
const RESULT_ACTION = 'design-done-close-result';

// A later state change, such as a reopen, ends a claim as surely as its result does.
const OPEN_CLAIMS = `SELECT c.seq, c.subject_id AS issue, c.data FROM events c
  WHERE c.subject = 'run' AND c.action = '${CLAIM_ACTION}'
    AND NOT EXISTS (
      SELECT 1 FROM events later
      WHERE later.subject = 'run' AND later.subject_id = c.subject_id AND later.seq > c.seq
        AND later.action IN ('state', '${CLAIM_ACTION}', '${RESULT_ACTION}'))
  ORDER BY c.subject_id`;

function readOpenCloseClaims(db: Database): CloseClaim[] {
  return ClaimRowsSchema.parse(db.query(OPEN_CLAIMS).all()).map((row) => ({ seq: row.seq, issue: row.issue, sessions: parseClaimSessions(row.data) }));
}

const ClaimedSessionSchema = z.object({ id: z.string(), active: z.boolean() });
const ClaimDataSchema = z.object({ sessions: z.array(ClaimedSessionSchema) });

function parseClaimSessions(data: string): ClaimedSession[] {
  const parsed: unknown = JSON.parse(data);
  return ClaimDataSchema.parse(parsed).sessions;
}

// Another pass may have finished the claim, or the run reopened, while this wrap-up ran.
function writeCloseResult(db: Database, claim: CloseClaim, wrapUp: WrapUp, actor: string): void {
  db.transaction(() => {
    if (!readOpenCloseClaims(db).some((open) => open.seq === claim.seq)) {
      return;
    }
    for (const target of pickSessionsToClose(wrapUp, claim.issue, claim.sessions)) {
      const seq = logEvent(db, 'run', claim.issue, 'design-done-close-session', actor, null, null, { ...target });
      enqueueOnce(db, { eventSeq: seq, target: orchestratorName(), text: formatCloseText(claim.issue, target), idemKey: `hq-design-done-${claim.issue}-${target.session}` });
    }
    logEvent(db, 'run', claim.issue, RESULT_ACTION, actor, null, null, { ...wrapUp });
  }).immediate();
}

function formatCloseText(issue: string, target: SessionToClose): string {
  const lead = `${issue}: its Design issue is Done in Linear, and the run is done.`;
  return match(target)
    .with({ why: 'pinned' }, (pinned) => `${lead} Unpin and stop session ${pinned.session}; hq does not stop a pinned session itself.`)
    .with({ why: 'failed' }, (failed) => `${lead} hq could not close session ${failed.session} (${failed.reason}); stop it if it is still running.`)
    .exhaustive();
}
