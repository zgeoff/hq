import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';

export const Z_SESSIONS: readonly string[] = getDeclaredSessions()
  .filter((session) => !session.roles.includes('developer'))
  .map((session) => session.name);
