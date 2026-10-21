import { resolve } from 'node:path';
import { config } from '../config/config.ts';
import { dbPath } from '../db/db-path.ts';

// Why hq must not write to atc now, or null. Only hq on the live database writes to the live
// atc: a test, or a run on a scratch database (a review, a check from source), once sent
// invented alerts to z-stu. A named socket (a test's fake atc) is always allowed.
export function writeRefusal(): string | null {
  if (config().HQ_ATC_SOCKET) return null;
  if (process.env.NODE_ENV === 'test') return 'a test never writes to the live atc; name a fake one with HQ_ATC_SOCKET';
  let db: string;
  try {
    db = resolve(dbPath());
  } catch (e) {
    return String((e as Error).message ?? e);
  }
  const live = resolve(`${process.env['HOME']}/.local/share/z-sessions/hq.db`);
  return db === live ? null : `hq on a scratch database (${db}) never writes to the live atc`;
}
