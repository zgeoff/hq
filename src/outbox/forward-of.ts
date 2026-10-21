import type { Database } from 'bun:sqlite';
import { forwards } from './forwards.ts';

export function forwardOf(db: Database, target: string): string {
  const map = forwards(db);
  const seen = new Set<string>();
  let t = target;
  while (map[t] && !seen.has(t)) {
    seen.add(t);
    t = map[t]!;
  }
  return t;
}
