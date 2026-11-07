import { HqError } from '../errors.ts';
import { atcStateDir } from './atc-state-dir.ts';
import { RestartRecordSchema } from './restart-record-schema.ts';
import type { RestartRecord } from './types.ts';

export async function readLastRestart(): Promise<RestartRecord> {
  const path = `${atcStateDir()}/restarts/last.json`;
  const f = Bun.file(path);
  if (!(await f.exists())) throw new HqError('no_restart', `no restart record at ${path}`);
  const parsed = RestartRecordSchema.safeParse(await f.json());
  if (!parsed.success) throw new HqError('bad_restart', `the restart record at ${path} is malformed at ${parsed.error.issues[0]?.path.join('.') || 'the top'}`);
  return parsed.data;
}
