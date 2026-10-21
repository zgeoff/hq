import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';

export interface NoslopSettings {
  repos: string[];
  sha: string | null;
}

const NOSLOP_KEY = 'noslop',
  NoslopMeta = z.object({ repos: z.array(z.string()), sha: z.string().nullable() });

export function loadNoslopSettings(db: Database): NoslopSettings {
  return metaJson(db, NOSLOP_KEY, NoslopMeta, { repos: [], sha: null });
}
