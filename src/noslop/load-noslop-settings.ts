import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';

export interface NoslopSettings {
  repos: string[];
  sha: string | null;

  // The emergency review cap per repo name (lower case); a repo with no entry has none.
  caps: Record<string, number>;
}

const NOSLOP_KEY = 'noslop',
  NoslopMeta = z.object({ repos: z.array(z.string()), sha: z.string().nullable(), caps: z.record(z.string(), z.number().int().positive()).default({}) });

export function loadNoslopSettings(db: Database): NoslopSettings {
  return metaJson(db, NOSLOP_KEY, NoslopMeta, { repos: [], sha: null, caps: {} });
}
