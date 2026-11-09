import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import { readCompletedIssues } from '../linear/read-completed-issues.ts';
import { listEvents } from '../list-events.ts';
import { logEvent } from '../log-event.ts';
import { enqueueOnce } from '../outbox/enqueue-once.ts';
import { readEvents } from '../read-events.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { CLOSE_CLAIM_EVENTS, findCloseClaim } from './find-close-claim.ts';
import type { CloseClaim } from './find-close-claim.ts';
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
// that dies in between leaves the claim open, and a pass after it goes stale takes it over.
export async function closeDoneDesignRuns(db: Database, deps: WrapUpDeps, actor: string): Promise<DesignRunsClose> {
  const result: DesignRunsClose = { closed: [], errors: [] };
  const ownSeqs = new Set<number>();
  for (const issue of pickDoneDesignRuns(readDesignRuns(db), readCompletedIssues(db))) {
    try {
      const seq = claimDoneDesignRun(db, issue, actor);
      if (seq !== null) {
        result.closed.push(issue);
        ownSeqs.add(seq);
      }
    } catch (error) {
      result.errors.push(`${issue}: ${toErrorMessage(error)}`);
    }
  }
  for (const issue of readClaimedIssues(db)) {
    try {
      const claim = takeCloseClaim(db, issue, ownSeqs, actor);
      if (claim !== null) {
        const wrapUp = await wrapUpRunSafely(db, deps, issue, { actor });
        writeCloseResult(db, claim, wrapUp, actor);
      }
    } catch (error) {
      result.errors.push(`${issue}: ${toErrorMessage(error)}`);
    }
  }
  return result;
}

const SessionRowsSchema = z.array(z.object({ session_id: z.string(), active: z.number() }));

// A closed run's sessions are all ended, so the claim records which were active before the close.
function claimDoneDesignRun(db: Database, issue: string, actor: string): number | null {
  return db
    .transaction(() => {
      const run = getRun(db, issue);
      if (run === null || CLOSED_RUN_STATES.includes(run.state)) {
        return null;
      }
      const rows = SessionRowsSchema.parse(db.query('SELECT session_id, active FROM run_sessions WHERE issue = ? ORDER BY added_at, session_id').all(issue));
      const sessions: ClaimedSession[] = rows.map((row) => ({ id: row.session_id, active: row.active === 1 }));
      setState(db, issue, 'done', { note: 'The Design issue is Done in Linear' }, actor);
      return logEvent(db, 'run', issue, 'design-done-close', actor, null, null, { sessions });
    })
    .immediate();
}

function readClaimedIssues(db: Database): string[] {
  const issues = listEvents(db, 'design-done-close')
    .filter((event) => event.subject === 'run')
    .map((event) => event.subject_id);
  return [...new Set(issues)].toSorted();
}

// A pass that takes over another pass's stale claim logs a claim of its own, so a third pass leaves
// the run to it and the stale pass, if it wakes, writes nothing.
function takeCloseClaim(db: Database, issue: string, ownSeqs: ReadonlySet<number>, actor: string): CloseClaim | null {
  return db
    .transaction(() => {
      const claim = readCloseClaim(db, issue, ownSeqs);
      if (claim === null || ownSeqs.has(claim.seq)) {
        return claim;
      }
      const seq = logEvent(db, 'run', issue, 'design-done-close', actor, null, null, { sessions: claim.sessions });
      return { ...claim, seq };
    })
    .immediate();
}

function readCloseClaim(db: Database, issue: string, ownSeqs: ReadonlySet<number>): CloseClaim | null {
  return findCloseClaim({ issue, state: getRun(db, issue)?.state ?? null, events: readEvents(db, 'run', issue, CLOSE_CLAIM_EVENTS), at: now(), ownSeqs });
}

// Another pass may have taken the claim over, or the run moved on, while this wrap-up ran.
function writeCloseResult(db: Database, claim: CloseClaim, wrapUp: WrapUp, actor: string): void {
  db.transaction(() => {
    if (readCloseClaim(db, claim.issue, new Set([claim.seq]))?.seq !== claim.seq) {
      return;
    }
    for (const target of pickSessionsToClose(wrapUp, claim.issue, claim.sessions)) {
      const seq = logEvent(db, 'run', claim.issue, 'design-done-close-session', actor, null, null, { ...target });
      enqueueOnce(db, { eventSeq: seq, target: orchestratorName(), text: formatCloseText(claim.issue, target), idemKey: `hq-design-done-${claim.issue}-${target.session}` });
    }
    logEvent(db, 'run', claim.issue, 'design-done-close-result', actor, null, null, { ...wrapUp });
  }).immediate();
}

function formatCloseText(issue: string, target: SessionToClose): string {
  const lead = `${issue}: its Design issue is Done in Linear, and the run is done.`;
  return match(target)
    .with({ why: 'pinned' }, (pinned) => `${lead} Unpin and stop session ${pinned.session}; hq does not stop a pinned session itself.`)
    .with({ why: 'failed' }, (failed) => `${lead} hq could not close session ${failed.session} (${failed.reason}); stop it if it is still running.`)
    .exhaustive();
}
