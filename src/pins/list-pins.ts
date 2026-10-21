import type { AtcClient } from '../atc/atc-client.ts';
import { sessionGetSchema } from '../atc/session-get-schema.ts';
import { sessionListRequiredSchema } from '../atc/session-list-required-schema.ts';
import { now } from '../clock/now.ts';
import { buildPins } from './build-pins.ts';
import type { Pin, PinRaw } from './types.ts';

export async function listPins(client: AtcClient): Promise<Pin[]> {
  const raw = (await client.call('session.list', {}, sessionListRequiredSchema)).sessions as PinRaw[];
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
