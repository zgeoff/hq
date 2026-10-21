import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { Samples } from './types.ts';

export function healthSamples(db: Database): Samples {
  return metaJson(db, 'health_samples', z.record(z.string(), z.array(z.tuple([z.string(), z.number()]))), {});
}
