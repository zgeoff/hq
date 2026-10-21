// The Nix uptime probe: one check a minute of Nix's /health/live, and of /health/ready while live
// answers, from this PC. Live failing is down; live fine but ready failing for UNREADY_AFTER_MIN is unready.
// A failure only counts as Nix being down when a known-up control URL answers; when both fail,
// the PC's own network, DNS or sleep is the cause, and the sample is blind.
import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { owner } from '../owner.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { readLocalSetting } from '../config/read-local-setting.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { downtime } from './downtime.ts';
import { formatClock } from './format-clock.ts';
import { KEEP_DAYS } from './keep-days.ts';
import { OPEN_AFTER } from './open-after.ts';
import { openOutage } from './open-outage.ts';
import { openUnready } from './open-unready.ts';
import type { Fetcher, ProbeResult, ProbeState } from './types.ts';

export async function probeOnce(db: Database, fetcher: Fetcher, actor: string): Promise<ProbeResult> {
  const t = await fetcher(readLocalSetting('HQ_PROBE_TARGET'));
  const c = t.ok ? null : await fetcher(control());
  const state: ProbeState = t.ok ? 'up' : c?.ok ? 'down' : 'blind';
  // Ready is asked only while live answers; a failing live check is the down logic's.
  let r: Awaited<ReturnType<Fetcher>> | null = null;
  if (t.ok) {
    r = await fetcher(readLocalSetting('HQ_PROBE_READY'));
  }
  const at = iso(now());
  const detail = t.ok ? null : `target ${t.error ?? t.status}; control ${c?.ok ? 'ok' : (c?.error ?? c?.status)}`;
  let opened: number | undefined;
  let closed: number | undefined;
  let unreadyOpened: number | undefined;
  let unreadyClosed: number | undefined;
  db.transaction(() => {
    db.query('INSERT OR REPLACE INTO probe_samples (at, target_ok, control_ok, ms, detail, ready_ok) VALUES (?, ?, ?, ?, ?, ?)').run(at, t.ok ? 1 : 0, c ? (c.ok ? 1 : 0) : null, t.ms, r && !r.ok ? `ready ${r.error ?? r.status}` : detail, r ? (r.ok ? 1 : 0) : null);
    const open = openOutage(db);
    if (state === 'up' && open) {
      const seq = logEvent(db, 'hq', 'probe', 'recovered', actor, null, null, { outage: open.id, started_at: open.started_at, ended_at: at });
      db.query('UPDATE outages SET ended_at = ?, recover_seq = ? WHERE id = ?').run(at, seq, open.id);
      // The same count as downtime(): minutes the PC could not see are blind, not down.
      const d = downtime(db, new Date(open.started_at), new Date(at));
      const blind = d.blindMinutes ? `; hq could not see ${d.blindMinutes} min of it (the PC was offline)` : '';
      tell(db, seq, `Nix is back: down ${d.downMinutes} min (${formatClock(open.started_at)}–${formatClock(at)} Sydney${blind}).`);
      closed = open.id;
    } else if (state === 'down' && !open) {
      const run = downRun(db);
      if (run.length >= OPEN_AFTER) {
        const startedAt = run[run.length - 1]!;
        const id = Number(db.query('INSERT INTO outages (started_at, detected_at) VALUES (?, ?)').run(startedAt, at).lastInsertRowid);
        const seq = logEvent(db, 'hq', 'probe', 'outage', actor, null, null, { outage: id, started_at: startedAt, checks: run.length });
        db.query('UPDATE outages SET alert_seq = ? WHERE id = ?').run(seq, id);
        tell(db, seq, `Nix is down: ${readLocalSetting('HQ_PROBE_TARGET')} failing since ${formatClock(startedAt)} (${run.length} checks; control URL fine). hq checks every minute and tells you when it is back.`);
        opened = id;
      }
    }
    const unready = openUnready(db);
    if (r?.ok && unready) {
      const seq = logEvent(db, 'hq', 'probe', 'ready', actor, null, null, { outage: unready.id, started_at: unready.started_at, ended_at: at });
      db.query('UPDATE outages SET ended_at = ?, recover_seq = ? WHERE id = ?').run(at, seq, unready.id);
      const mins = Math.round((Date.parse(at) - Date.parse(unready.started_at)) / 60_000);
      tell(db, seq, `Nix is ready again: unready ${mins} min (${formatClock(unready.started_at)}–${formatClock(at)} Sydney).`, 'nix-unready');
      unreadyClosed = unready.id;
    } else if (r && !r.ok && !unready) {
      // Minutes of failing ready checks, with live fine, that open an unready outage.
      const UNREADY_AFTER_MIN = 3,
        run = unreadyRun(db);
      const startedAt = run[run.length - 1];
      if (startedAt && Date.parse(at) - Date.parse(startedAt) >= UNREADY_AFTER_MIN * 60_000) {
        const id = Number(db.query("INSERT INTO outages (started_at, detected_at, kind) VALUES (?, ?, 'unready')").run(startedAt, at).lastInsertRowid);
        const seq = logEvent(db, 'hq', 'probe', 'unready', actor, null, null, { outage: id, started_at: startedAt, checks: run.length });
        db.query('UPDATE outages SET alert_seq = ? WHERE id = ?').run(seq, id);
        tell(db, seq, `Nix is unready: ${readLocalSetting('HQ_PROBE_READY')} failing since ${formatClock(startedAt)} (${run.length} checks; /health/live is fine). hq checks every minute and tells you when it is ready again.`, 'nix-unready');
        unreadyOpened = id;
      }
    }
    const cutoff = iso(new Date(now().getTime() - KEEP_DAYS * 86_400_000));
    db.query('DELETE FROM probe_samples WHERE at < ?').run(cutoff);
  }).immediate();
  // Outage alerts are not held over quiet hours (no isQuiet check): an outage is what the probe
  // exists to catch within 5 min. `hq probe run` sends the rows it queued as it ends, through the
  // same send as every command (main), which reports a failed send; not at the watcher's next tick.
  return { state, ...(opened !== undefined ? { opened } : {}), ...(closed !== undefined ? { closed } : {}), ...(r ? { ready: r.ok } : {}), ...(unreadyOpened !== undefined ? { unreadyOpened } : {}), ...(unreadyClosed !== undefined ? { unreadyClosed } : {}), ms: t.ms };
}

// The control URL, overridable in config; the live and ready URLs come from the local settings.
const CONTROL = 'https://api.github.com/zen';
const control = () => config().HQ_PROBE_CONTROL ?? CONTROL;

// Samples in the current unready run, newest first. Down and blind samples (target_ok = 0) belong to
// the down logic and are skipped; a ready one, or one from before v19 (ready_ok NULL), ends the run.
function unreadyRun(db: Database): string[] {
  const rows = db.query('SELECT at, target_ok, ready_ok FROM probe_samples WHERE target_ok = 1 ORDER BY at DESC LIMIT 200').all() as { at: string; target_ok: number; ready_ok: number | null }[];
  const run: string[] = [];
  for (const r of rows) {
    if (r.ready_ok !== 0) break;
    run.push(r.at);
  }
  return run;
}

// Samples that count toward a run of downs, newest first: blind ones are filtered out before the limit, an up one ends the run.
function downRun(db: Database): string[] {
  const rows = db.query(`SELECT at, target_ok, control_ok FROM probe_samples WHERE NOT (target_ok = 0 AND control_ok = 0) ORDER BY at DESC LIMIT 50`).all() as { at: string; target_ok: number; control_ok: number | null }[];
  const run: string[] = [];
  for (const r of rows) {
    if (r.target_ok) break;
    if (r.control_ok) run.push(r.at);
  }
  return run;
}

// z-stu decides whether to wake the owner; z-delivery starts the fix (GEO-1104). Both hear at once.
// Each kind has its own topic: a newer message replaces an unsent one of the same topic, so a
// "ready again" must never replace an unsent "Nix is back" or "Nix is down".
function tell(db: Database, seq: number, text: string, topic: 'nix-outage' | 'nix-unready' = 'nix-outage'): void {
  enqueue(db, seq, owner(), text, topic);
  enqueue(db, seq, orchestratorName(), text, topic);
}
