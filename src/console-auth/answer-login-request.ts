import type { LoginGate } from './read-login-gate.ts';

// A `login` request on the control socket. A new link goes only to the console's own terminal, by
// `print`; the reply the caller reads is "printed" or the refusal, never the link.
export function answerLoginRequest(gate: LoginGate, mintLink: () => string, print: (line: string) => void): string {
  if (!gate.ok) {
    return `refused: ${gate.reason}`;
  }
  print(`hq console: open ${mintLink()}  (one use; it replaces the last link)`);
  return 'printed';
}
