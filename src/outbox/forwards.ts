import type { Database } from 'bun:sqlite';
import { getDeclaredForwards as declaredForwards } from '../roles/get-declared-forwards.ts';
import { loadForwards as metaForwards } from './load-forwards.ts';

export function forwards(db: Database): Record<string, string> {
  return { ...declaredForwards(), ...metaForwards(db) };
}
