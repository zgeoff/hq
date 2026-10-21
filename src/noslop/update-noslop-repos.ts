import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { NoslopSettings } from './load-noslop-settings.ts';
import { writeNoslopSettings } from './write-noslop-settings.ts';

// Adds or removes repos; repeating a change changes nothing.
export function updateNoslopRepos(db: Database, change: 'on' | 'off', names: string[]): NoslopSettings {
  assertRepoNames(change, names);
  const current = loadNoslopSettings(db),
    next: NoslopSettings = { repos: applyRepoChange(current.repos, change, names), sha: current.sha };
  writeNoslopSettings(db, next);
  return next;
}

const BARE_REPO = /^[A-Za-z0-9._-]+$/u,
  NOSLOP_OWNER = 'zgeoff';

function assertRepoNames(change: 'on' | 'off', names: string[]): void {
  if (names.length === 0) {
    throw new HqError('bad_args', `hq noslop ${change} <repo...> needs at least one repo`);
  }
  for (const name of names) {
    if (!BARE_REPO.test(name) || name === '.' || name === '..') {
      throw new HqError('bad_args', `repo "${name}" must be a bare repo name like tools (the owner is ${NOSLOP_OWNER})`);
    }
  }
}

function applyRepoChange(current: string[], change: 'on' | 'off', names: string[]): string[] {
  const kept = new Set(current.map((name) => name.toLowerCase()));
  for (const name of names.map((each) => each.toLowerCase())) {
    if (change === 'on') {
      kept.add(name);
    } else {
      kept.delete(name);
    }
  }
  return [...kept].toSorted();
}
