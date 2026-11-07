import type { Database } from 'bun:sqlite';
import { toExactOptional } from '@zgeoff/std';
import { z } from 'zod';
import { DEFAULT_TARGETS } from './default-targets.ts';
import { GOAL_KEYS } from './goal-keys.ts';
import type { GoalKey } from './goal-keys.ts';
import { loadStoredTargets } from './load-stored-targets.ts';
import { OPS } from './ops.ts';
import type { Targets } from './types.ts';

const TargetSchema = z.object({ op: z.enum(OPS), value: z.number().finite(), until: z.string().optional(), detectMax: z.number().optional() });

export function goalTargets(db: Database): { targets: Targets; overridden: GoalKey[] } {
  const o = loadStoredTargets(db);
  const targets = { ...DEFAULT_TARGETS };
  const overridden: GoalKey[] = [];
  for (const k of GOAL_KEYS) {
    if (!Object.hasOwn(o, k)) continue;
    const v = o[k];
    if (v === null) {
      targets[k] = null;
    } else {
      const target = TargetSchema.safeParse(v);
      if (!target.success) {
        continue;
      }
      targets[k] = toExactOptional(target.data);
    }
    overridden.push(k);
  }
  return { targets, overridden };
}
