import { answerLoginRequest } from './answer-login-request.ts';
import { buildStartLine } from './build-start-line.ts';
import type { ConsoleAuth } from './create-console-auth.ts';
import { readLoginGate } from './read-login-gate.ts';
import type { LoginGateDeps } from './read-login-gate.ts';
import { serveConsoleControl } from './serve-console-control.ts';

export interface ConsoleLoginInput {
  port: number;
  auth: ConsoleAuth;
  gateDeps: LoginGateDeps;
  controlPath: string;
  print: (line: string) => void;
}

// Reads the gate once, at start: the start line and every later login request obey it, so a
// console started off the owner's terminal never prints a link.
export async function startConsoleLogin(input: ConsoleLoginInput): Promise<{ stop: () => void }> {
  const linkFor = (token: string) => `http://127.0.0.1:${input.port}/#t=${token}`;
  const gate = await readLoginGate(input.gateDeps);
  const control = await serveConsoleControl(input.controlPath, () => answerLoginRequest(gate, () => linkFor(input.auth.mintLogin()), input.print));
  input.print(buildStartLine(gate, input.port, () => linkFor(input.auth.mintLogin())));
  return control;
}
