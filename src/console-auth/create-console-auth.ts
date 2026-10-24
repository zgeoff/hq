import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface ConsoleAuth {
  mintLogin: () => string;
  exchange: (token: string) => string | null;
  hasSession: (value: string | null) => boolean;
}

// Held in this process's memory only: never in hq.db, a file, a log or an event. A login token is
// good for one exchange, and a new one replaces the last.
export function createConsoleAuth(): ConsoleAuth {
  let login: string | null = null;
  const sessions: string[] = [];
  return {
    mintLogin: () => {
      login = randomBytes(32).toString('base64url');
      return login;
    },
    exchange: (token) => {
      if (login === null || !isSame(token, login)) {
        return null;
      }
      login = null;
      const session = randomBytes(32).toString('base64url');
      sessions.push(session);
      return session;
    },
    hasSession: (value) => value !== null && sessions.some((session) => isSame(value, session)),
  };
}

function isSame(given: string, kept: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(kept);
  return left.length === right.length && timingSafeEqual(left, right);
}
