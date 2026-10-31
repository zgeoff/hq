import type { Database } from 'bun:sqlite';
import type { SessionInfo } from '../atc/session-schema.ts';
import { isPresentSession } from '../areas/is-present-session.ts';
import { countMinutesSince as mins } from './count-minutes-since.ts';
import { probeFinalAnswered } from './probe-final-answered.ts';
import { probeHandedIn } from './probe-handed-in.ts';
import { readClosedIssueAlerts } from './read-closed-issue-alerts.ts';
import { listRuns } from './list-runs.ts';
import { probeOpenUnblockWait } from './probe-open-unblock-wait.ts';
import { SWEEP_MINUTES as SWEEP } from './sweep-minutes.ts';
import type { Alert, RunSession } from './types.ts';

export function findAlerts(db: Database, sessions: SessionInfo[], activity: Map<string, number | null>, at: Date): Alert[] {
  const alerts: Alert[] = [];
  const byId = new Map(sessions.map((s) => [s.id, s]));
  for (const r of listRuns(db)) {
    for (const p of r.prs) {
      if (p.state !== 'open' || !p.final_sha || !p.final_at) continue;
      if (probeFinalAnswered(db, p)) {
        continue;
      }
      // A blocked run waits on something outside the PR (a release, a yes); its review can wait too.
      if (r.state === 'blocked') continue;
      if (probeOpenUnblockWait(db, r.waits_on)) {
        continue;
      }
      if (mins(p.final_at, at) < SWEEP.finalMinutes()) continue;
      if (p.review_started_at && p.review_started_at >= p.final_at && mins(p.review_started_at, at) < SWEEP.reviewMinutes()) continue;
      const moved = p.reviewed_sha ? `; head moved since your review at ${p.reviewed_sha.slice(0, 7)}${formatRestackHint(p.ref)}` : '';
      alerts.push({
        key: `pr:${p.ref}`,
        fingerprint: `final:${p.final_sha}`,
        issue: r.issue,
        line: `${p.ref} (${r.issue}) final at ${p.final_sha.slice(0, 7)} for ${Math.floor(mins(p.final_at, at))} min, no review${moved} [from ${p.final_source}]`,
      });
    }
    if (r.state !== 'working') continue;
    const mainActive = r.sessions.some((session) => session.design_pass === 0 && session.active === 1 && session.helper === 0);
    for (const active of findWatchedSessions(r.sessions)) {
      const who = `${active.helper ? 'helper ' : ''}session ${active.session_id.slice(0, 8)}`;
      const s = byId.get(active.session_id);
      if (!s || !isPresentSession(s)) {
        // Its work is handed in: a PR final and reviewed at its head. A session put to sleep
        // until its merge window is not lost work (z-delivery, GEO-957).
        if (!active.helper && probeHandedIn(db, r.prs)) {
          continue;
        }
        alerts.push({ key: `session:${active.session_id}`, fingerprint: 'exited', issue: r.issue, line: `${r.issue}: ${who} has exited; ${formatExitHint(r.issue, active)}` });
        continue;
      }

      // Asleep in its suspended imp, as for a host switch: present, but with no activity to read.
      if (!s.alive) {
        continue;
      }
      if (r.geoff_chat || r.waits_on_geoff) {
        continue;
      }

      // With no main session active, a helper carries the run, so its handed-in work silences it too.
      if ((!active.helper || !mainActive) && probeHandedIn(db, r.prs)) {
        continue;
      }
      const last = activity.get(active.session_id) ?? null;
      if (s.state !== 'running' && last !== null && (at.getTime() - last) / 60_000 >= SWEEP.quietMinutes()) {
        alerts.push({
          key: `session:${active.session_id}`,
          fingerprint: `quiet:${s.state}`,
          issue: r.issue,
          line: `${r.issue}: ${who} ${s.state === 'needs_you' ? 'waits on a prompt' : 'quiet'} for ${Math.floor((at.getTime() - last) / 60_000)} min`,
        });
      }
    }
  }
  return [...alerts, ...readClosedIssueAlerts(db)];
}

function formatRestackHint(ref: string): string {
  const [repo = '', pr = ''] = ref.split('#');
  return ` (a restack? a passed hq review ${repo} ${pr} records the new head)`;
}

// The run's active sessions, and with no active main session, the main one that ended last when the
// sweep ended it: atc no longer listed it, so its work may be lost. One ended by hand is not watched,
// nor one of the design pass the run turned from: the build run has its own.
function findWatchedSessions(sessions: readonly RunSession[]): RunSession[] {
  const own = sessions.filter((session) => session.design_pass === 0);
  const active = own.filter((session) => session.active === 1);
  const [last] = own.filter((session) => session.helper === 0).toSorted((left, right) => (right.ended_at ?? '').localeCompare(left.ended_at ?? ''));
  return active.some((session) => session.helper === 0) || last?.ended_by !== 'sweep' ? active : [...active, last];
}

// A helper, or a session the sweep ended, is dismissed with --remove; for a main session atc
// still lists, the run is checked for its PR instead.
function formatExitHint(issue: string, session: RunSession): string {
  return session.helper || session.ended_by === 'sweep' ? `wrap it up, or hq run session ${issue} ${session.session_id.slice(0, 8)} --remove` : 'check for its PR or final note';
}
