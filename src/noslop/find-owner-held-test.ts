import { OWNER } from '../releases/owner.ts';
import { isSkillText } from './is-skill-text.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';

type HeldTest = (path: string) => boolean;

export function findOwnerHeldTest(parsed: ParsedRepo): HeldTest | null {
  if (parsed.owner !== OWNER) {
    return null;
  }
  if (parsed.repo === 'hq') {
    return (path) => isSkillText(path) || path.startsWith('agent-kit/') || path.startsWith('grants/') || path === 'fleet.json';
  }
  if (parsed.repo === 'hq-private') {
    return (path) => isSkillText(path) || path.startsWith('grants/') || path.startsWith('docs/sessions') || path === 'session-prompt.md' || path.endsWith('/session-prompt.md');
  }
  return null;
}
