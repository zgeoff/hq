import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { NoslopSettings } from './load-noslop-settings.ts';
import { writeNoslopSettings } from './write-noslop-settings.ts';

// Sets a repo's emergency review cap, or clears it with `off`. The read and the write share one
// immediate transaction, so a list change or pin by another hq process in between is never lost.
export function updateNoslopCap(db: Database, repo: string | undefined, value: string | undefined): NoslopSettings {
  const name = requireRepoName(repo);
  const cap = requireCap(value);
  return db
    .transaction(() => {
      const current = loadNoslopSettings(db);
      const { [name]: _dropped, ...others } = current.caps;
      const next: NoslopSettings = { ...current, caps: cap === null ? others : { ...others, [name]: cap } };
      writeNoslopSettings(db, next);
      return next;
    })
    .immediate();
}

const BARE_REPO = /^[A-Za-z0-9._-]+$/u;

function requireRepoName(repo: string | undefined): string {
  if (repo === undefined || !BARE_REPO.test(repo) || repo === '.' || repo === '..') {
    throw new HqError('bad_args', 'hq noslop cap <repo> <n|off> needs a bare repo name like tools');
  }
  return repo.toLowerCase();
}

const WHOLE_NUMBER = /^\d+$/u;

function requireCap(value: string | undefined): number | null {
  if (value === 'off') {
    return null;
  }
  if (value === undefined || !WHOLE_NUMBER.test(value) || Number(value) < 1) {
    throw new HqError('bad_args', 'hq noslop cap <repo> <n|off> needs a whole number of 1 or more, or off');
  }
  return Number(value);
}
