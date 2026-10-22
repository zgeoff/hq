// pacing.json `lanes`: hq sums the slot counts by place into one pool (imp and local); the names stay
// for hq run lane and the band. `lends` is no longer read: hq focus reserves slots for an area instead.
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { parseSlotCounts } from '../lanes/parse-slot-counts.ts';
import type { LaneConfig } from './types.ts';

const NAME = /^[a-z][a-z0-9-]{0,39}$/u;

const MAX_SIZE = 100;

const fileSchema = z.object({ lanes: z.unknown(), slots: z.unknown() }).partial();

const placesSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

const sizeSchema = z.number().int().min(0).max(MAX_SIZE);

// pacing.json's `lanes`: { imp: { name: size }, local: { name: size } }. Bad entries are refused. A
// file with `slots` and no `lanes` gives one lane per place, named after it.
export function parseLanes(raw: unknown): LaneConfig[] {
  const parsed = fileSchema.safeParse(raw);
  const file = parsed.success ? parsed.data : {};
  if (file.lanes === undefined && file.slots !== undefined) {
    const counts = parseSlotCounts(file.slots);
    return [
      { name: 'imp', place: 'imp', size: counts.imp },
      { name: 'local', place: 'local', size: counts.local },
    ];
  }
  const places = placesSchema.safeParse(file.lanes);
  if (!places.success) {
    throw new HqError('no_lanes', 'pacing.json has no lanes');
  }
  const out: LaneConfig[] = [];
  for (const [place, lanes] of Object.entries(places.data)) {
    if (place !== 'imp' && place !== 'local') {
      throw new HqError('no_lanes', `pacing.json lanes: unknown place "${place}"`);
    }
    for (const [name, rawSize] of Object.entries(lanes)) {
      const size = sizeSchema.safeParse(rawSize);
      if (!NAME.test(name) || !size.success) {
        throw new HqError('no_lanes', `pacing.json lanes: bad lane ${place}.${name}`);
      }
      if (out.some((lane) => lane.name === name)) {
        throw new HqError('no_lanes', `pacing.json lanes: ${name} appears twice`);
      }
      out.push({ name, place, size: size.data });
    }
  }
  if (out.length === 0) {
    throw new HqError('no_lanes', 'pacing.json has no lanes');
  }
  return out;
}
