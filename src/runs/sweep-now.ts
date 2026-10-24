import type { Database } from 'bun:sqlite';
import { recordAwake } from '../areas/record-awake.ts';
import type { AtcClient } from '../atc/atc-client.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { now } from '../clock/now.ts';
import type { Runner } from '../runner/types.ts';
import { closeFlaggedPRs } from './close-flagged-prs.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';
import { findAlerts } from './find-alerts.ts';
import { sweep } from './sweep.ts';
import type { Alert } from './types.ts';
import { watchlist } from './watchlist.ts';

export async function sweepNow(db: Database, client: AtcClient, run: Runner, actor: string): Promise<{ alerts: Alert[]; sent: Alert[] }> {
  const sessions = await client.sessions();
  const activity = new Map<string, number | null>();
  for (const w of watchlist(db)) {
    try {
      const g = await client.call('session.get', { session: w.session_id }, sessionGetSchema);
      activity.set(w.session_id, typeof g.lastActivityAt === 'number' ? g.lastActivityAt : null);
    } catch {
      activity.set(w.session_id, null);
    }
  }

  // For the lanes: which runs are parked. Activity resets an idle session's clock.
  if (Array.isArray(sessions)) {
    recordAwake(db, sessions, activity);
    updateGoneRunSessions(db, sessions, actor);
  }
  const alerts = await closeFlaggedPRs(db, run, findAlerts(db, sessions, activity, now()));
  const { sent } = sweep(db, alerts, actor);
  return { alerts, sent };
}
