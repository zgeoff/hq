// Lanes by area (pacing.json `lanes`): slots are shares, not reservations. A free slot with no
// Ready work lends to an area with more Ready than room, nixie areas first and flexible last. A
// lane that `lends` maps to false (cleanup, memory) neither lends nor borrows.
import { HqError } from '../errors.ts';
import type { LaneConfig } from './types.ts';

// pacing.json's `lanes`: { imp: { name: size }, local: { name: size } }, and `lends`: { name: false }
// for lanes that keep to their own slots. Bad entries are refused.
export function parseLanes(raw: unknown): LaneConfig[] {
  const NAME = /^[a-z][a-z0-9-]{0,39}$/u,
    lanes = (raw as { lanes?: Record<string, Record<string, unknown>> } | null)?.lanes;
  if (!lanes || typeof lanes !== 'object') throw new HqError('no_lanes', 'pacing.json has no lanes');
  const out: LaneConfig[] = [];
  for (const place of Object.keys(lanes)) {
    if (place !== 'imp' && place !== 'local') throw new HqError('no_lanes', `pacing.json lanes: unknown place "${place}"`);
    for (const [name, size] of Object.entries(lanes[place] ?? {})) {
      if (!NAME.test(name) || !Number.isInteger(size) || (size as number) < 0 || (size as number) > 100) throw new HqError('no_lanes', `pacing.json lanes: bad lane ${place}.${name}`);
      if (out.some((l) => l.name === name)) throw new HqError('no_lanes', `pacing.json lanes: ${name} appears twice`);
      out.push({ name, place, size: size as number, lends: true });
    }
  }
  if (!out.length) throw new HqError('no_lanes', 'pacing.json has no lanes');
  return mergeLends(out, (raw as { lends?: unknown }).lends);
}

function mergeLends(lanes: LaneConfig[], raw: unknown): LaneConfig[] {
  if (raw === undefined) {
    return lanes;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HqError('no_lanes', 'pacing.json lends: must map lane names to true or false');
  }
  const lends = new Map(Object.entries(raw));
  for (const [name, value] of lends) {
    if (typeof value !== 'boolean' || !lanes.some((lane) => lane.name === name)) {
      throw new HqError('no_lanes', `pacing.json lends: bad entry ${name}`);
    }
  }
  return lanes.map((lane) => ({ ...lane, lends: lends.get(lane.name) !== false }));
}
