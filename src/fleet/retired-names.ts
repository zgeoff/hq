import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { loadDeclaredFleet as allDeclared } from './load-declared-fleet.ts';

export function retiredNames(db: Database): string[] {
  const declared = allDeclared().map((e) => e.name);
  return metaJson(db, 'fleet_retired', z.array(z.string()), []).filter((n) => declared.includes(n));
}
