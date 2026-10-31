import { existsSync } from 'node:fs';
import { overrideEnv } from '../config/override-env.ts';
import { declaredFleet } from '../fleet/declared-fleet.ts';
import type { FleetEntry } from '../fleet/types.ts';
import type { DefsSource } from '../prompts/defs-sources.ts';
import { DEFS_SOURCES } from '../prompts/defs-sources.ts';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { readPrompt } from '../prompts/read-prompt.ts';
import { resetFetchCache } from '../prompts/reset-fetch-cache.ts';
import type { GrantsSpawn } from './check-grants.ts';
import { checkGrants } from './check-grants.ts';
import { originMatches } from './origin-matches.ts';
import { readOrigin } from './read-origin.ts';
import type { Check } from './types.ts';

// `spawn` starts the grants check; tests pass a fake to pin its command line.
export function checkTrees(source: DefsSource, spawn: GrantsSpawn): Check[] {
  const defs = checkDefs(source);
  return defs.ready ? [...defs.checks, ...checkPrivate(DEFS_SOURCES[source].dir(), spawn)] : defs.checks;
}

function checkDefs(source: DefsSource): { ready: boolean; checks: Check[] } {
  const dir = DEFS_SOURCES[source].dir();
  if (!existsSync(`${dir}/.git`)) {
    return { ready: false, checks: [{ ok: false, line: `${dir} is not a checkout (hq defs setup ${source})` }] };
  }
  return checkDefsOrigin(source, dir);
}

const LANE_FILES = ['skills/delivery-lead/scripts/capacity.sh', 'skills/delivery-lead/pacing.json'];

function checkDefsOrigin(source: DefsSource, dir: string): { ready: boolean; checks: Check[] } {
  const origin = readOrigin(dir);
  if (!originMatches(origin, DEFS_SOURCES[source].repo)) {
    return { ready: false, checks: [{ ok: false, line: `${dir}'s origin is ${origin ?? 'not set'}, not ${DEFS_SOURCES[source].repo}` }] };
  }
  return { ready: true, checks: LANE_FILES.map((file) => checkLaneFile(dir, file)) };
}

function checkLaneFile(dir: string, file: string): Check {
  const present = existsSync(`${dir}/${file}`);
  return { ok: present, line: `${file} ${present ? 'present' : 'missing'} in the working tree` };
}

function checkPrivate(hqDir: string, spawn: GrantsSpawn): Check[] {
  const dir = PRIVATE_TREE.dir();
  if (!existsSync(`${dir}/.git`)) {
    return [{ ok: false, line: `${dir} is not a checkout (hq defs setup private)` }];
  }
  return checkPrivateOrigin(hqDir, dir, spawn);
}

function checkPrivateOrigin(hqDir: string, dir: string, spawn: GrantsSpawn): Check[] {
  const origin = readOrigin(dir);
  if (!originMatches(origin, PRIVATE_TREE.repo)) {
    return [{ ok: false, line: `${dir}'s origin is ${origin ?? 'not set'}, not ${PRIVATE_TREE.repo}` }];
  }
  return checkPrivatePrompts(hqDir, dir, spawn);
}

function checkPrivatePrompts(hqDir: string, dir: string, spawn: GrantsSpawn): Check[] {
  const restore = overrideEnv('HQ_DEFINITIONS_DIR', hqDir);
  resetFetchCache();
  try {
    return [...declaredFleet().flatMap((entry) => checkRolePrompt(entry)), checkGrants(hqDir, dir, spawn)];
  } finally {
    restore();
    resetFetchCache();
  }
}

function checkRolePrompt(entry: FleetEntry): Check[] {
  if (!entry.prompt.startsWith('main:')) {
    return [];
  }
  try {
    return [{ ok: true, line: `${entry.name}: ${entry.prompt.slice(5)} reads from hq-private origin/main (${readPrompt(entry.prompt).length} chars)` }];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ ok: false, line: `${entry.name}: ${message.slice(0, 300)}` }];
  }
}
