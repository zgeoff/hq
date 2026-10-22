import type { Database } from 'bun:sqlite';
import { loadDeclaredFleet as allDeclared } from './load-declared-fleet.ts';
import { retiredNames } from './retired-names.ts';
import type { FleetEntry } from './types.ts';

export function declaredFleet(db?: Database): FleetEntry[] {
  const retired = db ? retiredNames(db) : [];
  return allDeclared().filter((e) => !retired.includes(e.name));
}
