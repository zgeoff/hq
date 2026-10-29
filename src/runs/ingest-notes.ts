import type { Database } from 'bun:sqlite';
import type { AtcClient } from '../atc/atc-client.ts';
import { eventsCursorSchema } from '../atc/events-cursor-schema.ts';
import { eventsReadSchema } from '../atc/events-read-schema.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import type { Runner } from '../runner/types.ts';
import { applyNoteSignals } from './apply-note-signals.ts';
import { cursorIndex } from './cursor-index.ts';
import { findOpenSession } from './find-open-session.ts';
import { FROM_START } from './from-start.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { readFinalClaims } from './read-final-claims.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { sendNoteToOrchestrator } from './send-note-to-orchestrator.ts';
import type { FeedEvent, FinalClaim, FinalResolutions, IngestResult } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

interface IngestOptions {
  maxPages?: number;
  run: Runner;
}

// Read atc's event feed from the stored cursor. A decision or blocked note goes
// to the orchestrator. A note from a session on an open row becomes a run note; each page commits with its cursor, so a crash
// re-reads at most one page and the event key keeps that idempotent.
export async function ingestNotes(db: Database, client: AtcClient, opts: IngestOptions): Promise<IngestResult> {
  const CURSOR_KEY = 'atc_events_cursor',
    result: IngestResult = { read: 0, notes: 0, routed: 0, finals: [], unmatched: 0, reset: false, bootstrapped: false };
  let cursor = getMeta(db, CURSOR_KEY);
  const maxPages = opts.maxPages ?? 50;
  const resolveFinal = makeFinalResolver(opts.run);
  const orchestrator = orchestratorName();

  if (!cursor) {
    // First run: skip the history, start at the end of the feed.
    cursor = await feedEnd(client);
    setMeta(db, CURSOR_KEY, cursor);
    result.bootstrapped = true;
    return result;
  }

  // Cursor values repeat after a feed reset, so event keys carry an epoch.
  let epoch = Number(getMeta(db, 'atc_events_epoch') ?? '0');
  // After a reset, read the new feed from its start; content dedupe skips notes already kept.
  const restart = () => {
    epoch++;
    setMeta(db, 'atc_events_epoch', String(epoch));
    setMeta(db, CURSOR_KEY, FROM_START);
    setMeta(db, 'atc_events_idle', '0');
    result.reset = true;
  };

  for (let page = 0; page < maxPages; page++) {
    let r: { events: FeedEvent[]; cursor: string; more: boolean };
    try {
      r = await client.call('events.read', { cursor, limit: 200 }, eventsReadSchema);
    } catch (e) {
      if (String((e as Error).message).includes('is not an events.read cursor')) {
        restart();
        return result;
      }
      throw e;
    }

    // bun:sqlite runs a transaction synchronously, so GitHub is read before it opens.
    const resolutions = await resolveFinals(db, r.events, resolveFinal);
    db.transaction(() => {
      for (const e of r.events) {
        result.read++;
        if (e.kind !== 'note' || !e.detail) continue;
        if (sendNoteToOrchestrator(db, e, orchestrator)) {
          result.routed++;
        }
        const row = findOpenSession(db, e.session);
        if (row === null) {
          result.unmatched++;
          continue;
        }
        const noteAt = toNoteTime(e);
        if (hasSameNote(db, e)) {
          continue;
        }
        const ins = db
          .query(`INSERT INTO run_notes (issue, session_id, label, text, source, event_key, at) VALUES (?, ?, ?, ?, 'atc', ?, ?) ON CONFLICT (event_key) DO NOTHING`)
          .run(row.issue, e.session, e.label ?? null, e.detail, `${epoch}:${e.cursor}`, noteAt);
        if (ins.changes === 0) continue;
        result.notes++;

        // A late note from the design pass the run turned from stays on the run, but marks nothing on the build.
        if (row.design_pass === 1) {
          continue;
        }
        const sig = applyNoteSignals(db, row.issue, e.detail, { source: `atc:${e.session.slice(0, 8)}`, note: Number(ins.lastInsertRowid), actor: e.name ?? e.session.slice(0, 8), resolutions });
        if (sig.final) result.finals.push(sig.final);
        touch(db, row.issue);
      }
      setMeta(db, CURSOR_KEY, r.cursor);
    }).immediate();
    // A cursor past the end (the event log was reset) reads nothing forever: detect it.
    if (r.events.length === 0 && page === 0) {
      const idle = Number(getMeta(db, 'atc_events_idle') ?? '0') + 1;
      setMeta(db, 'atc_events_idle', String(idle));
      if (idle >= 3) {
        const end = await feedEnd(client);
        setMeta(db, 'atc_events_idle', '0');
        if (cursorIndex(end) < cursorIndex(r.cursor)) {
          restart();
          return result;
        }
      }
    } else if (r.events.length > 0) {
      setMeta(db, 'atc_events_idle', '0');
    }
    cursor = r.cursor;
    if (!r.more) break;
  }
  return result;
}

// The cursor at the end of the feed, found by paging from the oldest event.
async function feedEnd(client: AtcClient): Promise<string> {
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const r = await client.call('events.read', { ...(cursor ? { cursor } : {}), limit: 200 }, eventsCursorSchema);
    cursor = r.cursor;
    if (!r.more) return cursor;
  }
  return cursor!;
}

function resolveFinals(db: Database, events: FeedEvent[], resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>): Promise<FinalResolutions> {
  const claims = events.flatMap((event) => {
    if (event.kind !== 'note' || !event.detail || hasSameNote(db, event)) {
      return [];
    }
    const row = findOpenSession(db, event.session);
    return row === null || row.design_pass === 1 ? [] : readFinalClaims(db, row.issue, event.detail);
  });
  return resolveFinal(claims);
}

// A feed reset replays a note under a new cursor, so only its session, time and text find it again.
function hasSameNote(db: Database, event: FeedEvent): boolean {
  return db.query(`SELECT 1 FROM run_notes WHERE session_id = ? AND at = ? AND text = ?`).get(event.session, toNoteTime(event), event.detail ?? null) !== null;
}

// Milliseconds are kept: two notes in one second stay two.
function toNoteTime(event: FeedEvent): string {
  return new Date(event.at).toISOString();
}
