import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { loadDeclaredFleet as allDeclared } from './load-declared-fleet.ts';

// Names retired from the fleet (a role merged away). `hq fleet remove` adds one, `restore` takes it back.
// A name dropped from the declaration (z-refine, merged into z-triage) needs no retiring.
export function retiredNames(db: Database): string[] {
  const declared = allDeclared().map((e) => e.name);
  return metaJson(db, 'fleet_retired', z.array(z.string()), []).filter((n) => declared.includes(n));
}
