import type { Database } from 'bun:sqlite';
import { recordAwake } from '../areas/record-awake.ts';
import type { AtcClient } from '../atc/atc-client.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { now } from '../clock/now.ts';
import type { Runner } from '../runner/types.ts';
import { closeFlaggedPRs } from './close-flagged-prs.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import type { AtcView } from './end-handed-in-run-sessions.ts';
import type { SessionActivity } from './pick-quiet-sessions.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';
import { findAlerts } from './find-alerts.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { sweep } from './sweep.ts';
import { SWEEP_MINUTES as SWEEP } from './sweep-minutes.ts';
import { toErrorMessage } from '../to-error-message.ts';
import type { Alert } from './types.ts';
import { watchlist } from './watchlist.ts';
import { shareClient, wrapUpMergedRuns } from './wrap-up-merged-runs.ts';
import type { AtcSnapshot } from './wrap-up-part-sessions.ts';
import { wrapUpPartSessions } from './wrap-up-part-sessions.ts';

export interface SweepOptions {
  actor: string;
  wrapUpDeps: WrapUpDeps;
  log: (line: string) => void;
  readIssueDescription?: (issue: string) => Promise<string>;
}

export async function sweepNow(db: Database, client: AtcClient, run: Runner, options: SweepOptions): Promise<{ alerts: Alert[]; sent: Alert[] }> {
  const sessions = await client.sessions();
  const activity = new Map<string, number | null>();
  const read = new Map<string, SessionActivity | null>();
  for (const w of watchlist(db)) {
    const got = await readSessionActivity(client, w.session_id);
    activity.set(w.session_id, got?.lastActivityAt ?? null);
    read.set(w.session_id, got);
  }

  if (Array.isArray(sessions)) {
    recordAwake(db, sessions, activity);
    updateGoneRunSessions(db, sessions, options.actor);
    const wrapUpDeps = shareClient(options.wrapUpDeps);
    const readActivity = (id: string) => (read.has(id) ? Promise.resolve(read.get(id) ?? null) : readSessionActivity(client, id));
    await endHandedInRunSessionsSafely(db, { readActivity }, { ...options, wrapUpDeps });
    await wrapUpMergedRunsSafely(db, { ...options, wrapUpDeps });
    await wrapUpPartSessionsSafely(db, wrapUpDeps, { sessions, activity }, options);
  }
  const alerts = await closeFlaggedPRs(db, run, findAlerts(db, sessions, activity, now()));
  const swept = sweep(db, alerts, options.actor);
  return { alerts, sent: swept.sent };
}

async function readSessionActivity(client: AtcClient, id: string): Promise<SessionActivity | null> {
  try {
    const session = await client.call('session.get', { session: id }, sessionGetSchema);
    return { lastActivityAt: session.lastActivityAt, pendingMessage: session.pending?.message ?? null };
  } catch {
    return null;
  }
}

async function endHandedInRunSessionsSafely(db: Database, atc: AtcView, options: SweepOptions): Promise<void> {
  try {
    await endHandedInRunSessions(db, atc, options.wrapUpDeps, {
      actor: options.actor,
      ...(options.readIssueDescription === undefined ? {} : { holds: { readIssueDescription: options.readIssueDescription, log: options.log } }),
    });
  } catch (error) {
    options.log(`handed-in session end failed: ${toErrorMessage(error)}`);
  }
}

async function wrapUpMergedRunsSafely(db: Database, options: SweepOptions): Promise<void> {
  try {
    await wrapUpMergedRuns(db, options.wrapUpDeps, { actor: options.actor });
  } catch (error) {
    options.log(`merged-run wrap-up failed: ${toErrorMessage(error)}`);
  }
}

async function wrapUpPartSessionsSafely(db: Database, deps: WrapUpDeps, atc: AtcSnapshot, options: SweepOptions): Promise<void> {
  try {
    await wrapUpPartSessions(db, deps, atc, { actor: options.actor, log: options.log, nowMs: now().getTime(), quietMs: SWEEP.quietMinutes() * 60_000 });
  } catch (error) {
    options.log(`part-session wrap-up failed: ${toErrorMessage(error)}`);
  }
}
