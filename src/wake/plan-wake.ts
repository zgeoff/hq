import type { SessionInfo } from '../atc/session-schema.ts';
import { atcStateDir } from './atc-state-dir.ts';
import type { RestartRecord, WakePlan, WakeReason } from './types.ts';

// Pure: who gets which message. Keys match the old wake.ts, so running both
// for one restart still sends each session one message.
export function planWake(last: RestartRecord, sessions: SessionInfo[], listed: { id: string; name: string }[], orchestrator: string, loopPrompt: string | null): WakePlan {
  const plan: WakePlan = { runID: last.runID, messages: [], skipped: [] };
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const live = (id: string) => byId.get(id)?.alive === true;
  const add = (id: string, name: string, reason: WakeReason) => {
    if (plan.messages.some((m) => m.session === id)) return;
    plan.messages.push({ session: id, name, reason, text: wakeText(reason, last, loopPrompt), idempotencyKey: `wake-${last.runID}-${id}` });
  };

  const orch = sessions.filter((s) => s.alive && s.name === orchestrator);
  if (orch.length === 1) add(orch[0]!.id, orchestrator, 'orchestrator');
  else plan.skipped.push({ session: '', name: orchestrator, why: orch.length ? `${orch.length} live sessions share the name` : 'no live session by that name' });

  for (const s of last.interrupted ?? []) {
    if (live(s.id)) add(s.id, s.name, 'interrupted');
    else plan.skipped.push({ session: s.id, name: s.name, why: 'not alive' });
  }
  for (const s of listed) {
    if (live(s.id)) add(s.id, s.name, 'background');
    else if (!plan.messages.some((m) => m.session === s.id)) plan.skipped.push({ session: s.id, name: s.name, why: 'not alive' });
  }
  return plan;
}

// /loop cron jobs live in the Claude process: an atc restore starts a new one without them.
const LOOP_CHECK = " If you run a /loop, check CronList; when its jobs are gone, re-arm it from your start prompt's /loop line.";

function wakeText(reason: WakeReason, last: RestartRecord, loopPrompt: string | null): string {
  switch (reason) {
    case 'orchestrator': {
      const how = loopPrompt
        ? `read ${loopPrompt} (hq took it from your start prompt on origin/main) and pass its text, prefixed with "/loop ", to ScheduleWakeup`
        : 'hq could not read your start prompt from origin/main, so re-arm it from the /loop line of your start prompt as it stands on main';
      return `The atc daemon restarted (run ${last.runID}, code ${last.code}, restored ${last.restored}/${last.total}). Your loop's wakeup died with it. Re-arm the loop now: ${how}, then run a tick. Check the restart log in ${atcStateDir()}/restarts/${last.runID}.log.`;
    }
    case 'background':
      return 'The atc daemon restarted and ended your background tasks, such as CI waits. Your work is intact. Check the state you were waiting on, start your waits again, and carry on under your launch prompt.' + LOOP_CHECK;
    case 'interrupted':
      return 'The atc daemon restarted and cut off your last turn. Your work is intact. Carry on from where you stopped, under your launch prompt.' + LOOP_CHECK;
  }
}
