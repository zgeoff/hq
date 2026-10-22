import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { metaJson } from '../db/meta-json.ts';
import { strMap } from '../db/str-map.ts';
import { checkRcMarker as rcEvaluate } from './check-rc-marker.ts';
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
      return r.step;
    }
    if (now().getTime() - start > (RC_MAX_MIN + 5) * 60_000) return null;
    await sleep(rc.pollMs ?? getRcPollMs());
  }
}

function getRcPollMs(): number {
  const n = config().HQ_RC_POLL_MS;
  return Number.isFinite(n) && n >= 0 ? n : 15_000;
}
