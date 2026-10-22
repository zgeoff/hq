import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import type { Targets } from './types.ts';

export function loadStoredTargets(db: Database): Partial<Targets> {
  try {
    const j = JSON.parse(getMeta(db, 'goal_targets') ?? '{}') as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Partial<Targets>) : {};
  } catch {
    return {};
  }
}
