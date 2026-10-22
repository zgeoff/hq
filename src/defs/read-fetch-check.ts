import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { resetFetchCache } from '../prompts/reset-fetch-cache.ts';
import { runMainFetch } from '../prompts/run-main-fetch.ts';
import type { Check } from './types.ts';

const FETCH_RECORD = z.object({ at: z.string(), error: z.string().nullable() }).nullable();

// For hq health: can hq fetch hq-private's main? A broken GitHub credential shows here before a
// restart needs the start prompts, so the fetch runs at most hourly.
export function readFetchCheck(db: Database): Check & { key: string } {
  const last = metaJson(db, 'defs_fetch_check', FETCH_RECORD, null),
    record = last && Date.now() - Date.parse(last.at) <= 3_600_000 ? last : writeFetchRecord(db);
  return {
    key: 'defs-fetch',
    ok: !record.error,
    line: record.error ? `can't fetch hq-private main: ${record.error.slice(0, 300)}` : `hq-private main fetches (checked ${record.at.slice(0, 16)}Z)`,
  };
}

function writeFetchRecord(db: Database): { at: string; error: string | null } {
  resetFetchCache();
  const record = { at: new Date().toISOString(), error: runMainFetch(PRIVATE_TREE.dir()) };
  setMeta(db, 'defs_fetch_check', JSON.stringify(record));
  return record;
}
