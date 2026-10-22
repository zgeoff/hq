import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { getMeta } from './db/get-meta.ts';
import { setMeta } from './db/set-meta.ts';
import type { ConditionsDeps, ConditionsResult } from './check-unblock-conditions.ts';
import { checkUnblockConditions } from './check-unblock-conditions.ts';

// At most every 10 min, the watcher closes the unblock items whose conditions hold and drops those
// whose subject PR merged or closed. The throttle is set before the reads, so a pass that fails or
// hangs waits its 10 min too.
export async function runUnblockConditionsTick(db: Database, deps: ConditionsDeps, actor: string, at: Date = now()): Promise<ConditionsResult | null> {
  const CHECKED_AT = 'unblock_subjects_checked_at',
    last = Date.parse(getMeta(db, CHECKED_AT) ?? '1970-01-01T00:00:00Z');
  if (at.getTime() - last < 10 * 60_000) {
    return null;
  }
  setMeta(db, CHECKED_AT, iso(at));
  return await checkUnblockConditions(db, deps, actor);
}
