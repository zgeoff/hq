import { createConsoleAuth } from '../src/console-auth/create-console-auth.ts';
import type { ConsoleAuth } from '../src/console-auth/create-console-auth.ts';

// A console's login store with one session already swapped for its login token.
export function createSignedInAuth(): { auth: ConsoleAuth; session: string } {
  const auth = createConsoleAuth();
  const session = auth.exchange(auth.mintLogin());
  if (session === null) {
    throw new Error('a fresh login token swaps for a session');
  }
  return { auth, session };
}
