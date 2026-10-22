import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { LaneSkip } from './types.ts';

export const LANE_SKIPS_KEY = 'lanes_skips';

const skipsSchema = z.array(z.object({ issue: z.string(), until: z.string(), reason: z.string(), by: z.string(), at: z.string() }));

// Every stored skip, ended ones the Ready tick has not dropped yet included, in issue order.
export function readLaneSkips(db: Database): LaneSkip[] {
  return metaJson(db, LANE_SKIPS_KEY, skipsSchema, []);
}
