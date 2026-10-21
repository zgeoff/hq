import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';
import { buildFixesOnlyRefusalKey } from './build-fixes-only-refusal-key.ts';
import { parseJSON } from './parse-json.ts';

const RefusalSchema = z.object({ head: z.string(), why: z.string() });

// noslop's words when it refused a --fixes-only run on the PR at `head`; null when it refused none
// there, refused one at another head, or the record does not parse.
export function findFixesOnlyRefusal(db: Database, repo: string, pr: number, head: string): string | null {
  const json = getMeta(db, buildFixesOnlyRefusalKey(repo, pr)) ?? '',
    parsed = RefusalSchema.safeParse(parseJSON(json));
  if (!parsed.success || parsed.data.head !== head) {
    return null;
  }
  return parsed.data.why;
}
