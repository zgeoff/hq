// Goal targets (the goals rhythm): code defaults, with overrides in meta `goal_targets` that the
// weekly review moves. An override of null clears a target. Every change logs an events row.
import type { Database } from 'bun:sqlite';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { GOAL_KEYS } from './goal-keys.ts';
import type { GoalKey } from './goal-keys.ts';
import { loadStoredTargets } from './load-stored-targets.ts';
import { OPS } from './ops.ts';
import type { Target, Targets } from './types.ts';

// The targets in force, and which keys an override sets.
export function goalTargets(db: Database): { targets: Targets; overridden: GoalKey[] } {
  const o = loadStoredTargets(db);
  const targets = { ...DEFAULT_TARGETS };
  const overridden: GoalKey[] = [];
  for (const k of GOAL_KEYS) {
    if (!Object.hasOwn(o, k)) continue;
    const v = o[k];
    if (v === null) targets[k] = null;
    else if (good(v)) targets[k] = v;
    else continue; // an unreadable override is ignored
    overridden.push(k);
  }
  return { targets, overridden };
}

const good = (t: unknown): t is Target => !!t && typeof t === 'object' && (OPS as readonly string[]).includes((t as Target).op) && Number.isFinite((t as Target).value);
