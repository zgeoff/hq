import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import { ControlRequestSchema, encodeControlLine } from './control-protocol.ts';
import type { ControlReply } from './control-protocol.ts';

// Takes a login ControlRequest over a socket only this uid may open. The reply carries no link: the
// console prints any new link on its own terminal, so a caller learns only whether it printed.
export async function serveConsoleControl(path: string, onLogin: () => ControlReply): Promise<{ stop: () => void }> {
  const answering = existsSync(path) ? await probeAnswering(path) : false;
  if (answering) {
    throw new HqError('console_running', `another hq console already answers at ${path}: stop it first, or run hq console login for a new link from it`);
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  rmSync(path, { force: true });
  const server = Bun.listen({
    unix: path,
    socket: {
      data(socket, chunk) {
        const asked = ControlRequestSchema.safeParse(readJSON(Buffer.from(chunk).toString('utf8')));
        const reply: ControlReply = asked.success ? onLogin() : { status: 'unknown-request' };
        socket.end(encodeControlLine(reply));
      },
    },
  });
  chmodSync(path, 0o600);
  return {
    stop: () => {
      server.stop(true);
      rmSync(path, { force: true });
    },
  };
}

async function probeAnswering(path: string): Promise<boolean> {
  try {
    const socket = await Bun.connect({ unix: path, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

function readJSON(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
