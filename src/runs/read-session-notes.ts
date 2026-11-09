import type { AtcClient } from '../atc/atc-client.ts';
import { eventsReadSchema } from '../atc/events-read-schema.ts';
import type { FeedEvent } from './types.ts';

const MAX_PAGES = 50;

// atc narrows the read to the session. The session test here also keeps a daemon that ignores the filter honest.
export async function readSessionNotes(client: AtcClient, session: string, sinceMs: number): Promise<FeedEvent[]> {
  const notes: FeedEvent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const read = await client.call('events.read', { session, limit: 200, ...(cursor ? { cursor } : { from: 'start' }) }, eventsReadSchema);
    for (const event of read.events) {
      if (event.kind === 'note' && event.detail && event.session === session && event.at >= sinceMs) {
        notes.push(event);
      }
    }
    cursor = read.cursor;
    if (!read.more) {
      break;
    }
  }
  return notes;
}
