import type { LoginGate } from './read-login-gate.ts';

// What `hq console` prints on start: a login link only when the gate allows one.
export function buildStartLine(gate: LoginGate, port: number, mintLink: () => string): string {
  if (gate.ok) {
    return `hq console: open ${mintLink()}  (one use; Ctrl-C stops it)`;
  }
  return `hq console: http://127.0.0.1:${port}/ serves, but prints no login link: ${gate.reason}. Start hq console in your own terminal for one.`;
}
