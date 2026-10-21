import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import type { BackupRun } from './types.ts';

const BACKUP_RUN = z.object({ at: z.string(), ok: z.boolean(), snapshot: z.string().nullable(), remote: z.string(), error: z.string().nullable(), seconds: z.number() });

export function lastBackup(db: Database): { last: BackupRun | null; lastOk: string | null; test: Record<string, unknown> | null } {
  const last = metaJson(db, 'backup_last', BACKUP_RUN.nullable(), null);
  const test = metaJson(db, 'backup_test', z.record(z.string(), z.unknown()).nullable(), null);
  return { last, lastOk: getMeta(db, 'backup_last_ok'), test };
}
