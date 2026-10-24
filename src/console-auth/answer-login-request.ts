import type { ControlReply } from './control-protocol.ts';
import type { LoginGate } from './read-login-gate.ts';

// A `login` request on the control socket. A new link goes only to the console's own terminal, by
// `print`; the reply the caller reads says only whether it printed.
export function answerLoginRequest(gate: LoginGate, mintLink: () => string, print: (line: string) => void): ControlReply {
  if (!gate.ok) {
    return { status: 'refused', reason: gate.reason };
  }
  print(`hq console: open ${mintLink()}  (one use; it replaces the last link)`);
  return { status: 'printed' };
}
