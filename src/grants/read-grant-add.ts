import { iso } from '../clock/iso.ts';
import type { MainGrant } from './read-main-grants.ts';
import { runPrivateGit } from './run-private-git.ts';

// When a grant took effect, and the hq-private PR that added it.
export interface GrantAdd {
  at: string;
  ref: string;
}

// The newest main commit that changed how often the grant's id line appears in its file. The id is
// on main now, so that commit is the add in force: a grant removed and added again takes the later
// add. Null when that commit's subject names no PR, as a squash merge's `(#n)` does.
export function readGrantAdd(directory: string, grant: MainGrant): GrantAdd | null {
  const line = runPrivateGit(directory, ['log', 'origin/main', '-1', '--pickaxe-regex', '-S', `^- id: ${escapeRegex(grant.id)}$`, '--format=%cI%x09%s', '--', `grants/${grant.session}.yaml`]).trim();
  const [at = '', subject = ''] = line.split('\t');
  const pr = /\(#(?<pr>\d+)\)$/u.exec(subject)?.groups?.['pr'];
  if (pr === undefined) {
    return null;
  }
  return { at: iso(new Date(at)), ref: `hq-private#${pr}` };
}

function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
