import type { Database } from 'bun:sqlite';
import { owner } from '../owner.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { strMap } from '../db/str-map.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { checkRcMarker as rcEvaluate } from './check-rc-marker.ts';
import { formatStep as sayStep } from './format-step.ts';
import { HELD } from './held.ts';
import { loadRcPending as rcPending } from './load-rc-pending.ts';
import { RC_MAX_MIN } from './rc-max-min.ts';
import type { EnsureStep, FleetClient, RcDeps, RcEval } from './types.ts';

// `hq fleet rc NAME`: the helper. Looks every poll until the marker ends. Gives up quietly past the
// limit (the 5-minute ensure still covers it), and when the marker is gone or replaced.
export async function rcWatch(db: Database, client: FleetClient, rc: RcDeps, name: string, actor: string): Promise<EnsureStep | null> {
  const first = rcPending(db)[name];
  if (!first || !client.submit) return null;
  const sleep = rc.sleep ?? Bun.sleep;
  const start = Date.parse(first.since);
  for (;;) {
    const known = metaJson(db, 'fleet_ids', strMap, {});
    let r: RcEval;
    try {
      r = await rcEvaluate(db, { client, rc, name, known, actor, replaced: 'quiet' });
    } catch {
      r = { kind: 'wait' }; // atc away for a moment
    }
    if (r.kind === 'none') return null;
    if (r.kind === 'done') {
      deliver(db, now(), r.seq, r.step);
      return r.step;
    }
    if (now().getTime() - start > (RC_MAX_MIN + 5) * 60_000) return null;
    await sleep(rc.pollMs ?? getRcPollMs());
  }
}

// Queues one step's message to z-stu; quiet hours hold it, as they hold ensure's.
function deliver(db: Database, t: Date, seq: number, step: EnsureStep): void {
  const text = `hq fleet: ${sayStep(step)}.`;
  db.transaction(() => {
    if (isQuiet(t) && !step.urgent) setMeta(db, 'fleet_held', JSON.stringify([...metaJson(db, 'fleet_held', HELD, []), { seq, text }]));
    else enqueue(db, seq, owner(), text);
  }).immediate();
}

function getRcPollMs(): number {
  const n = config().HQ_RC_POLL_MS;
  return Number.isFinite(n) && n >= 0 ? n : 15_000;
}
