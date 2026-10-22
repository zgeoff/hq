import { HqError } from '../errors.ts';
import { atcStateDir } from './atc-state-dir.ts';
import type { RestartRecord } from './types.ts';

export async function readLastRestart(): Promise<RestartRecord> {
  const f = Bun.file(`${atcStateDir()}/restarts/last.json`);
  if (!(await f.exists())) throw new HqError('no_restart', `no restart record at ${atcStateDir()}/restarts/last.json`);
  return (await f.json()) as RestartRecord;
}
