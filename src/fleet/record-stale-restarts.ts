import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { refreshSchema } from './refresh-schema.ts';
import { writeFleetRefresh } from './write-fleet-refresh.ts';
import type { RestartedSession } from './run-stale-restart-tick.ts';
import type { EnsureStep } from './types.ts';

// Closes each restart once ensure has run: a spawn is news and clears the entry; any other
// outcome tells z-stu at once, and fleet_missing_since lets a later ensure spawn the session.
// `steps` is null when ensure itself threw.
export function recordStaleRestarts(db: Database, restarted: RestartedSession[], steps: EnsureStep[] | null, actor: string): void {
  if (restarted.length === 0) {
    return;
  }
  const refresh = metaJson(db, 'fleet_refresh', refreshSchema, {});
  for (const r of restarted) {
    const step = steps?.find((s) => s.name === r.name),
      why = step ? `${step.action}: ${step.detail}` : 'ensure did not finish';
    if (step?.action === 'spawned') {
      addNews(db, { from: actor, topic: 'other', text: `${r.name} restarted from main; its old prompt predated ${r.commit}`, issue: null, link: null, needsGeoff: false });
    } else {
      sendRestartFailure(db, r, why, actor);
    }
    delete refresh[r.name];
  }
  writeFleetRefresh(db, refresh);
}

function sendRestartFailure(db: Database, restarted: RestartedSession, why: string, actor: string): void {
  const seq = logEvent(db, 'hq', 'fleet', 'urgent', actor, null, null, { name: restarted.name, why });
  enqueue(
    db,
    seq,
    owner(),
    `hq fleet: ${restarted.name} was stopped and forgotten for a stale prompt (main ${restarted.commit}) but not spawned again (${why}). A later 5-minute check spawns it; look if it does not.`,
  );
}
