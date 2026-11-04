import type { Database } from 'bun:sqlite';
import { recordAwake } from '../areas/record-awake.ts';
import type { AtcClient } from '../atc/atc-client.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { now } from '../clock/now.ts';
import type { Runner } from '../runner/types.ts';
import { closeFlaggedPRs } from './close-flagged-prs.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import type { AtcView } from './end-handed-in-run-sessions.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';
import { findAlerts } from './find-alerts.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { sweep } from './sweep.ts';
import { toMessage } from './to-message.ts';
import type { Alert } from './types.ts';
import { watchlist } from './watchlist.ts';
import { shareClient, wrapUpMergedRuns } from './wrap-up-merged-runs.ts';

export interface SweepOptions {
  actor: string;
  wrapUpDeps: WrapUpDeps;
  log: (line: string) => void;
}

export async function sweepNow(db: Database, client: AtcClient, run: Runner, options: SweepOptions): Promise<{ alerts: Alert[]; sent: Alert[] }> {
  const sessions = await client.sessions();
  const activity = new Map<string, number | null>();
  for (const w of watchlist(db)) {
    const last = await readLastActivityAt(client, w.session_id);
    activity.set(w.session_id, last);
  }

  if (Array.isArray(sessions)) {
    recordAwake(db, sessions, activity);
    updateGoneRunSessions(db, sessions, options.actor);
    const wrapUpDeps = shareClient(options.wrapUpDeps);
    const readActivity = (id: string) => (activity.has(id) ? Promise.resolve(activity.get(id) ?? null) : readLastActivityAt(client, id));
    await endHandedInRunSessionsSafely(db, { sessions, readActivity }, { ...options, wrapUpDeps });
    await wrapUpMergedRunsSafely(db, { ...options, wrapUpDeps });
  }
  const alerts = await closeFlaggedPRs(db, run, findAlerts(db, sessions, activity, now()));
  const swept = sweep(db, alerts, options.actor);
  return { alerts, sent: swept.sent };
}

async function readLastActivityAt(client: AtcClient, id: string): Promise<number | null> {
  try {
    const session = await client.call('session.get', { session: id }, sessionGetSchema);
    return typeof session.lastActivityAt === 'number' ? session.lastActivityAt : null;
  } catch {
    return null;
  }
}

async function endHandedInRunSessionsSafely(db: Database, atc: AtcView, options: SweepOptions): Promise<void> {
  try {
    await endHandedInRunSessions(db, atc, options.wrapUpDeps, { actor: options.actor });
  } catch (error) {
    options.log(`handed-in session end failed: ${toMessage(error)}`);
  }
}

async function wrapUpMergedRunsSafely(db: Database, options: SweepOptions): Promise<void> {
  try {
    await wrapUpMergedRuns(db, options.wrapUpDeps, { actor: options.actor });
  } catch (error) {
    options.log(`merged-run wrap-up failed: ${toMessage(error)}`);
  }
}
