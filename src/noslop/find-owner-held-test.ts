import { OWNER } from '../releases/owner.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';

type HeldTest = (path: string) => boolean;

export function findOwnerHeldTest(parsed: ParsedRepo): HeldTest | null {
  if (parsed.owner !== OWNER) {
    return null;
  }
  if (parsed.repo === 'hq') {
    return (path) => ['skills/', 'agent-kit/', 'docs/', '.claude/', 'grants/'].some((prefix) => path.startsWith(prefix)) || path === 'fleet.json';
  }
  if (parsed.repo === 'hq-private') {
    return (path) => path.startsWith('skills/') || path.startsWith('grants/') || path.startsWith('docs/sessions') || path === 'session-prompt.md' || path.endsWith('/session-prompt.md');
  }
  return null;
}
