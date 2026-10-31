import { OWNER } from '../releases/owner.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';

type HeldTest = (path: string) => boolean;

// Which paths need the owner's lgtm to change: the skills, the agent kit and fleet in hq, and the skills, grants,
// session docs and start prompts in hq-private. Null for a repo with none.
export function findOwnerHeldTest(parsed: ParsedRepo): HeldTest | null {
  if (parsed.owner !== OWNER) {
    return null;
  }
  if (parsed.repo === 'hq') {
    return (path) => path.startsWith('skills/') || path.startsWith('agent-kit/') || path === 'fleet.json';
  }
  if (parsed.repo === 'hq-private') {
    return (path) => path.startsWith('skills/') || path.startsWith('grants/') || path.startsWith('docs/sessions') || path === 'session-prompt.md' || path.endsWith('/session-prompt.md');
  }
  return null;
}
