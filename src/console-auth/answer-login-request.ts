import type { ControlReply } from './control-protocol.ts';
import type { LoginGate } from './read-login-gate.ts';

export function answerLoginRequest(gate: LoginGate, mintLink: () => string, print: (line: string) => void): ControlReply {
  if (!gate.ok) {
    return { status: 'refused', reason: gate.reason };
  }
  print(`hq console: open ${mintLink()}  (one use; it replaces the last link)`);
  return { status: 'printed' };
}
