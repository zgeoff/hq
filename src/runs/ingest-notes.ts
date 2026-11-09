import type { Database } from 'bun:sqlite';
import type { AtcClient } from '../atc/atc-client.ts';
import { eventsCursorSchema } from '../atc/events-cursor-schema.ts';
import { eventsReadSchema } from '../atc/events-read-schema.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import type { Runner } from '../runner/types.ts';
import { cursorIndex } from './cursor-index.ts';
import { FROM_START } from './from-start.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { readFeedFinals } from './read-feed-finals.ts';
import { readNotePlan } from './read-note-plan.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { sendNoteToOrchestrator } from './send-note-to-orchestrator.ts';
import type { FeedEvent, IngestResult } from './types.ts';
import { writeNote } from './write-note.ts';
import { toErrorMessage } from '../to-error-message.ts';

interface IngestOptions {
  maxPages?: number;
  run: Runner;
}

export async function ingestNotes(db: Database, client: AtcClient, opts: IngestOptions): Promise<IngestResult> {
  const CURSOR_KEY = 'atc_events_cursor';
  const result: IngestResult = { read: 0, notes: 0, routed: 0, finals: [], unmatched: 0, reset: false, bootstrapped: false };
  let cursor = getMeta(db, CURSOR_KEY);
  const maxPages = opts.maxPages ?? 50;
  const resolveFinal = makeFinalResolver(opts.run);
  const orchestrator = orchestratorName();

  if (!cursor) {
    cursor = await feedEnd(client);
    setMeta(db, CURSOR_KEY, cursor);
    result.bootstrapped = true;
    return result;
  }

  // Cursor values repeat after a feed reset, so event keys carry an epoch.
  let epoch = Number(getMeta(db, 'atc_events_epoch') ?? '0');
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
      if (toErrorMessage(e).includes('is not an events.read cursor')) {
        restart();
        return result;
      }
      throw e;
    }

    // bun:sqlite runs a transaction synchronously, so GitHub is read before it opens.
    const resolutions = await readFeedFinals(db, r.events, resolveFinal);
    db.transaction(() => {
      for (const e of r.events) {
        result.read++;
        if (e.kind !== 'note' || !e.detail) continue;
        if (sendNoteToOrchestrator(db, e, orchestrator)) {
          result.routed++;
        }
        const notePlan = readNotePlan(db, e);
        if (notePlan.session === null) {
          result.unmatched++;
          continue;
        }
        if (notePlan.plan === 'duplicate') {
          continue;
        }
        const written = writeNote(db, e, notePlan.plan, { issue: notePlan.session.issue, epoch, resolutions });
        if (written.stored) {
          result.notes++;
        }
        if (written.final) {
          result.finals.push(written.final);
        }
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

async function feedEnd(client: AtcClient): Promise<string> {
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const r = await client.call('events.read', { ...(cursor ? { cursor } : {}), limit: 200 }, eventsCursorSchema);
    cursor = r.cursor;
    if (!r.more) return cursor;
  }
  return cursor!;
}
