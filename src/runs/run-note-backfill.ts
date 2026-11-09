import type { Database } from 'bun:sqlite';
import type { AtcClient } from '../atc/atc-client.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import type { Runner } from '../runner/types.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { getRun } from './get-run.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { pickBackfillStart } from './pick-backfill-start.ts';
import type { BackfillAttach } from './pick-backfill-start.ts';
import { readFeedFinals } from './read-feed-finals.ts';
import { readNotePlan } from './read-note-plan.ts';
import { readSessionNotes } from './read-session-notes.ts';
import { writeNote } from './write-note.ts';

interface BackfillInput {
  issue: string;
  session: string;
  attach: BackfillAttach;
  run: Runner;
  openClient: () => Promise<AtcClient>;
}

export type BackfillResult = { kind: 'read'; notes: number; finals: string[] } | { kind: 'unread'; reason: string };

export async function runNoteBackfill(db: Database, input: BackfillInput): Promise<BackfillResult> {
  const run = getRun(db, input.issue);
  if (run === null) {
    return { kind: 'read', notes: 0, finals: [] };
  }
  let events;
  try {
    const client = await input.openClient();
    try {
      events = await readSessionNotes(client, input.session, pickBackfillStart(input.attach, run.created_at, now().getTime()));
    } finally {
      client.close();
    }
  } catch (error) {
    return { kind: 'unread', reason: toErrorMessage(error) };
  }

  const resolutions = await readFeedFinals(db, events, makeFinalResolver(input.run));
  const epoch = Number(getMeta(db, 'atc_events_epoch') ?? '0');
  const result: { kind: 'read'; notes: number; finals: string[] } = { kind: 'read', notes: 0, finals: [] };
  db.transaction(() => {
    for (const event of events) {
      const notePlan = readNotePlan(db, event);
      if (notePlan.session === null || notePlan.plan === 'duplicate') {
        continue;
      }
      const written = writeNote(db, event, notePlan.plan, { issue: notePlan.session.issue, epoch, resolutions });
      if (written.stored) {
        result.notes++;
      }
      if (written.final) {
        result.finals.push(written.final);
      }
    }
  }).immediate();
  return result;
}
