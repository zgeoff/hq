import { iso } from '../clock/iso.ts';
import { parseGrantEntries } from './read-main-grants.ts';
import type { MainGrant } from './read-main-grants.ts';
import { runPrivateGit } from './run-private-git.ts';

// When a grant took effect, and the hq-private PR that added it.
export interface GrantAdd {
  at: string;
  ref: string;
}

// The newest main commit whose parent's grants file lacks the id: the add in force, since the id is
// on main now. Null when that commit's subject names no PR, as a squash merge's `(#n)` does.
export function readGrantAdd(directory: string, grant: MainGrant): GrantAdd | null {
  const path = `grants/${grant.session}.yaml`;
  const commits = runPrivateGit(directory, ['log', 'origin/main', '--first-parent', '--format=%H%x09%cI%x09%s', '--', path])
    .split('\n')
    .filter((line) => line !== '');
  for (const commit of commits) {
    const [hash = '', at = '', subject = ''] = commit.split('\t');
    if (!readHoldsGrant(directory, `${hash}^:${path}`, grant.id)) {
      return buildGrantAdd(at, subject);
    }
  }
  return null;
}

// A file version that is missing or unreadable holds no grant.
function readHoldsGrant(directory: string, object: string, id: string): boolean {
  const shown = Bun.spawnSync(['git', '-C', directory, 'show', object], { timeout: 30_000 });
  if (shown.exitCode !== 0) {
    return false;
  }
  return parseGrantEntries(shown.stdout.toString())?.some((entry) => entry.id === id) ?? false;
}

function buildGrantAdd(at: string, subject: string): GrantAdd | null {
  const pr = /\(#(?<pr>\d+)\)$/u.exec(subject)?.groups?.['pr'];
  if (pr === undefined) {
    return null;
  }
  return { at: iso(new Date(at)), ref: `hq-private#${pr}` };
}
