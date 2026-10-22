// pacing.json `lanes`: hq sums the slot counts by place into one pool (imp and local); the names stay
// for hq run lane and the band. `lends` is no longer read: hq focus reserves slots for an area instead.
import { HqError } from '../errors.ts';
import { parseSlotCounts } from '../lanes/parse-slot-counts.ts';
import type { LaneConfig } from './types.ts';

// pacing.json's `lanes`: { imp: { name: size }, local: { name: size } }. Bad entries are refused. A
// file with `slots` and no `lanes` gives one lane per place, named after it.
export function parseLanes(raw: unknown): LaneConfig[] {
  const NAME = /^[a-z][a-z0-9-]{0,39}$/u,
    lanes = (raw as { lanes?: Record<string, Record<string, unknown>> } | null)?.lanes,
    slots = (raw as { slots?: unknown } | null)?.slots;
  if (lanes === undefined && slots !== undefined) {
    const counts = parseSlotCounts(slots);
    return [
      { name: 'imp', place: 'imp', size: counts.imp },
      { name: 'local', place: 'local', size: counts.local },
    ];
  }
  if (!lanes || typeof lanes !== 'object') throw new HqError('no_lanes', 'pacing.json has no lanes');
  const out: LaneConfig[] = [];
  for (const place of Object.keys(lanes)) {
    if (place !== 'imp' && place !== 'local') throw new HqError('no_lanes', `pacing.json lanes: unknown place "${place}"`);
    for (const [name, size] of Object.entries(lanes[place] ?? {})) {
      if (!NAME.test(name) || !Number.isInteger(size) || (size as number) < 0 || (size as number) > 100) throw new HqError('no_lanes', `pacing.json lanes: bad lane ${place}.${name}`);
      if (out.some((l) => l.name === name)) throw new HqError('no_lanes', `pacing.json lanes: ${name} appears twice`);
      out.push({ name, place, size: size as number });
    }
  }
  if (!out.length) throw new HqError('no_lanes', 'pacing.json has no lanes');
  return out;
}
