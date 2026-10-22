import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { owner } from '../owner.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { enqueue } from '../outbox/enqueue.ts';
import type { RcState } from '../rc/types.ts';
import { claimTyping } from './claim-typing.ts';
import { formatStep } from './format-step.ts';
import { HELD } from './held.ts';
import { loadRcPending as rcPending } from './load-rc-pending.ts';
import { RC_MAX_MIN } from './rc-max-min.ts';
import { RC_PENDING } from './rc-pending.ts';
import { RC_SETTLE_MIN } from './rc-settle-min.ts';
import type { EnsureStep, RcCheck, RcEval, RcPending } from './types.ts';
import { updateRcPending as setPending } from './update-rc-pending.ts';

// One look at one marker. Never loops; the helper and the 5-minute ensure both call it.
export async function checkRcMarker(db: Database, check: RcCheck): Promise<RcEval> {
  // RC_TYPING_MS: a marker typed this recently belongs to the actor that typed it. RC_RETRY: mid-turn
  // refusals, where nothing went in, so a later look tries again. RC_CONFIRM_POLLS: one look every 2 s.
  const RC_CONFIRM_POLLS = 15,
    RC_RETRY = new Set(['atc_too_slow', 'atc_permission_pending']),
    RC_TYPING_MS = 2 * 60_000,
    client = check.client,
    name = check.name,
    o = check,
    p = rcPending(db)[name],
    rc = check.rc;
  if (!p) return { kind: 'none' };
  const t = now();
  const end = (action: EnsureStep['action'], text: string, data: Record<string, unknown>) => rcFinish(db, name, p, action, text, data, o.actor);
  const newer = o.known[name];
  if (newer && newer !== p.id) return o.replaced === 'quiet' ? { kind: 'none' } : end('remote control', `was replaced by ${newer.slice(0, 8)} before hq typed; hq typed nothing.`, { result: 'replaced' });
  const all = await client.sessions();
  if (!Array.isArray(all)) return { kind: 'wait' };
  const s = all.find((x) => x.id === p.id);
  if (!s?.alive) return end('failed', 'is gone; hq typed nothing.', { result: 'gone' });
  const st = rc.state(p.id);
  if (p.typedAt) {
    // Another actor is typing and confirming right now: leave it. An older mark with no report is a crash or a hand edit.
    if (t.getTime() - Date.parse(p.typedAt) < RC_TYPING_MS) return { kind: 'wait' };
    return end(st.state === 'on' ? 'remote control' : 'failed', `hq did not type (already marked as typed); Remote Control is ${st.state}.`, { result: 'marked', rc: st });
  }
  if (st.state === 'on') return end('remote control', 'Remote Control was already on; hq typed nothing.', { result: 'already on', rc: st });
  const age = (t.getTime() - Date.parse(p.since)) / 60_000;
  const done = s.state === 'done';
  if (!done || age < RC_SETTLE_MIN) {
    // A turn that has ended is judged even past the limit: the limit is for one that never ends.
    if (age >= RC_MAX_MIN && !done) return end('failed', `did not finish its start turn in ${RC_MAX_MIN} min (atc shows ${s.state ?? 'no state'}); hq typed nothing. Type /remote-control in the session yourself.`, { result: 'timed out', state: s.state });
    return { kind: 'wait' };
  }
  if (st.state === 'unknown') return end('failed', `hq can't tell whether Remote Control is on (${st.why}); hq typed nothing. Type /remote-control in the session yourself.`, { result: 'unknown', rc: st });
  // Off, the session is idle: type once.
  if (!claimTyping(db, name, p.id, t)) return { kind: 'wait' };
  const mine = iso(t);
  const endMine = (action: EnsureStep['action'], text: string, data: Record<string, unknown>, alarm?: string) => rcFinish(db, name, p, action, text, data, o.actor, mine, alarm);
  try {
    await client.submit!(p.id, `/remote-control ${name}`);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (RC_RETRY.has(code)) {
      releaseTyping(db, name, p.id); // nothing went in: a later look tries again
      return { kind: 'wait' };
    }
    return endMine('failed', `typing into the session failed (${String((err as Error).message ?? err)}); check the session and type /remote-control yourself if it is off.`, { result: 'type failed', code });
  }
  const sleep = rc.sleep ?? Bun.sleep;
  let last: RcState = st;
  for (let i = 0; i < RC_CONFIRM_POLLS; i++) {
    await sleep(2_000);
    last = rc.state(p.id);
    if (last.state === 'on') break;
  }
  if (last.state === 'on') return endMine('remote control', `typed /remote-control ${name}; Remote Control is on.`, { result: 'on', rc: last });

  // z-stu: told at once, since the typing may have turned off a Remote Control the owner had turned on.
  return endMine('failed', `typed /remote-control ${name}, but no Remote Control record showed within 30 s (${last.why}).`, { result: 'not on', rc: last }, `Remote Control may be off in ${name}: typed, no record (${p.id.slice(0, 8)}). Ask the owner to check.`);
}

function releaseTyping(db: Database, name: string, id: string): void {
  db.transaction(() => {
    const all = rcPending(db);
    const cur = all[name];
    if (!cur || cur.id !== id) return;
    delete cur.typedAt;
    setMeta(db, RC_PENDING, JSON.stringify(all));
  }).immediate();
}

// Ends a marker: removes it, logs one event, and queues its report in the same transaction, so a
// process that stops after the removal cannot lose the report. Null when the marker is gone or
// belongs to another spawn.
function rcFinish(db: Database, name: string, p: RcPending, action: EnsureStep['action'], text: string, data: Record<string, unknown>, actor: string, claim: string | undefined = p.typedAt, alarm?: string): RcEval {
  const sid = p.id.slice(0, 8);
  return db
    .transaction((): RcEval => {
      const cur = rcPending(db)[name];
      if (!cur || cur.id !== p.id) return { kind: 'none' };
      // A stale worker must not discard a result another worker has claimed since it looked.
      if (cur.typedAt !== claim) return { kind: 'wait' };
      setPending(db, name, null);
      const seq = logEvent(db, 'hq', 'fleet', 'remote-control', actor, null, null, { name, id: p.id, ...data });
      const step: EnsureStep = { name, action, detail: `${sid}: ${text}`, message: alarm ?? `${name} ${sid}: ${text}`, id: p.id, ...(alarm ? { urgent: true } : {}) };
      deliverStep(db, seq, step);
      return { kind: 'done', seq, step };
    })
    .immediate();
}

// Quiet hours hold the report, as they hold ensure's; an urgent one goes out at once.
function deliverStep(db: Database, seq: number, step: EnsureStep): void {
  const text = `hq fleet: ${formatStep(step)}.`;
  if (isQuiet(now()) && !step.urgent) {
    setMeta(db, 'fleet_held', JSON.stringify([...metaJson(db, 'fleet_held', HELD, []), { seq, text }]));
    return;
  }
  enqueue(db, seq, owner(), text);
}
