import { isOneOf } from '@zgeoff/std';
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
import type { Target } from './types.ts';

const VALUE = /^\d{1,6}(?:\.\d{1,3})?$/u;

export function setTarget(db: Database, key: string, op: string, value: string | undefined, actor: string): Target | null {
  if (!isOneOf(key, GOAL_KEYS)) {
    throw new HqError('bad_args', `unknown goal ${JSON.stringify(key).slice(0, 40)}: one of ${GOAL_KEYS.join(', ')}`);
  }
  let next: Target | null = null;
  if (op === 'none') {
    if (value !== undefined) {
      throw new HqError('bad_args', 'none takes no value');
    }
  } else {
    if (!isOneOf(op, OPS)) {
      throw new HqError('bad_args', `the operator must be one of ${OPS.join(' ')}, or use none to clear the target`);
    }
    const range = getValueRange(key);
    if (value === undefined || !VALUE.test(value) || Number(value) > range.max) {
      throw new HqError('bad_args', `the value must be a number from 0 to ${range.max} (${range.unit})`);
    }
    const cur = goalTargets(db).targets[key] ?? DEFAULT_TARGETS[key];
    next = { op, value: Number(value), ...(cur?.until ? { until: cur.until } : {}), ...(cur?.detectMax === undefined ? {} : { detectMax: cur.detectMax }) };
  }
  return db
    .transaction(() => {
      const before = goalTargets(db).targets[key];
      const stored = loadStoredTargets(db);
      stored[key] = next;
      setMeta(db, 'goal_targets', JSON.stringify(stored));
      logEvent(db, 'hq', 'goals', 'target', actor, formatTarget(before), formatTarget(next), { key });
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
