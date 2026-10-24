import { HqError } from '../errors.ts';
import { askConsoleLogin } from './ask-console-login.ts';
import { controlSocketPath } from './control-socket-path.ts';

// `hq console login`: the running console prints a new link on its own terminal, when the gate it
// read at start allows one. No link ever comes back here, so a caller in a session gets none.
export async function runConsoleLogin(): Promise<{ data: { status: 'printed' }; text: string }> {
  const reply = await askConsoleLogin(controlSocketPath());
  if (reply.status === 'refused') {
    throw new HqError('not_owner_terminal', `the console printed no new login link: ${reply.reason}`);
  }
  if (reply.status === 'unknown-request') {
    throw new HqError('bad_answer', 'the running console does not know the login request: it predates this hq; restart it');
  }
  return { data: { status: reply.status }, text: 'hq console: a new one-use login link is on the terminal where hq console runs' };
}
