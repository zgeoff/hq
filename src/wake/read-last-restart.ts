import { HqError } from '../errors.ts';
import { atcStateDir } from './atc-state-dir.ts';
import { RestartRecordSchema } from './restart-record-schema.ts';
import type { RestartRecord } from './types.ts';

export async function readLastRestart(): Promise<RestartRecord> {
  const path = `${atcStateDir()}/restarts/last.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new HqError('no_restart', `no restart record at ${path}`);
  }
  const record: unknown = await file.json();
  const parsed = RestartRecordSchema.safeParse(record);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new HqError('bad_restart', `the restart record at ${path} is malformed at ${issue?.path.join('.') || 'the top'}`);
  }
  return parsed.data;
}
