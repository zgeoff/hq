import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { GOAL_KEYS } from './goal-keys.ts';
import type { GoalKey } from './goal-keys.ts';
import { goalTargets } from './goal-targets.ts';
import { loadStoredTargets } from './load-stored-targets.ts';
import { OPS } from './ops.ts';
import type { Op } from './ops.ts';
import type { Target } from './types.ts';

const VALUE = /^\d{1,6}(?:\.\d{1,3})?$/u;

// hq goals target <key> <op> <value> | hq goals target <key> none
export function setTarget(db: Database, key: string, op: string, value: string | undefined, actor: string): Target | null {
  if (!(GOAL_KEYS as readonly string[]).includes(key)) throw new HqError('bad_args', `unknown goal ${JSON.stringify(key).slice(0, 40)}: one of ${GOAL_KEYS.join(', ')}`);
  const k = key as GoalKey;
  let next: Target | null = null;
  if (op !== 'none') {
    if (!(OPS as readonly string[]).includes(op)) throw new HqError('bad_args', `the operator must be one of ${OPS.join(' ')}, or use none to clear the target`);
    const range = getValueRange(k);
    if (value === undefined || !VALUE.test(value) || Number(value) > range.max) {
      throw new HqError('bad_args', `the value must be a number from 0 to ${range.max} (${range.unit})`);
    }
    // Only the value and the operator move: a deadline or a detection limit stays.
    // A cleared target has none to keep: they come back from the code default.
    const cur = goalTargets(db).targets[k] ?? DEFAULT_TARGETS[k];
    next = { op: op as Op, value: Number(value), ...(cur?.until ? { until: cur.until } : {}), ...(cur?.detectMax !== undefined ? { detectMax: cur.detectMax } : {}) };
  } else if (value !== undefined) throw new HqError('bad_args', 'none takes no value');
  return db
    .transaction(() => {
      const before = goalTargets(db).targets[k],
        o = loadStoredTargets(db);
      o[k] = next;
      setMeta(db, 'goal_targets', JSON.stringify(o));
      logEvent(db, 'hq', 'goals', 'target', actor, formatTarget(before), formatTarget(next), { key: k });
      return next;
    })
    .immediate();
}

function formatTarget(t: Target | null): string {
  return t ? `${t.op}${t.value}` : 'none';
}

function getValueRange(key: GoalKey): { max: number; unit: string } {
  if (key === 'downtime') {
    return { max: 10_080, unit: 'minutes a week' };
  }
  if (key === 'cost') {
    return { max: 10_000, unit: 'US dollars a month of GitHub Actions' };
  }
  return { max: 100, unit: 'percent' };
}
