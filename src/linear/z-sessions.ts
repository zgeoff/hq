import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { isZSession } from './is-z-session.ts';
import type { ZSession } from './types.ts';

const names = getDeclaredSessions()
  .filter((session) => !session.roles.includes('developer'))
  .map((session) => session.name);

export const Z_SESSIONS: readonly ZSession[] = names.filter((name) => isZSession(name, names));
