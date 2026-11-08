import type { AtcClient } from '../atc/atc-client.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { now } from '../clock/now.ts';
import { buildPins } from './build-pins.ts';
import { pinListSchema } from './pin-list-schema.ts';
import type { Pin } from './types.ts';

export async function listPins(client: AtcClient): Promise<Pin[]> {
  const listing = await client.call('session.list', {}, pinListSchema);
  const raw = listing.sessions;
  const activity = new Map<string, number | null>();
  for (const s of raw.filter((x) => x.pinned)) {
    try {
      const g = await client.call('session.get', { session: s.id }, sessionGetSchema);
      activity.set(s.id, typeof g.lastActivityAt === 'number' ? g.lastActivityAt : null);
    } catch {
      activity.set(s.id, null);
    }
  }
  return buildPins(raw, activity, now());
}
