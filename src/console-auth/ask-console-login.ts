import { HqError } from '../errors.ts';
import { ControlReplySchema, encodeControlLine } from './control-protocol.ts';
import type { ControlReply } from './control-protocol.ts';

// Asks the running console to print a new login link on its own terminal, and returns its reply.
export async function askConsoleLogin(path: string): Promise<ControlReply> {
  const reply = Promise.withResolvers<string>();
  let answer = '';
  try {
    await Bun.connect({
      unix: path,
      socket: {
        open(socket) {
          socket.write(encodeControlLine({ request: 'login' }));
        },
        data(_socket, chunk) {
          answer += Buffer.from(chunk).toString('utf8');
        },
        close() {
          reply.resolve(answer.trim());
        },
        error(_socket, error) {
          reply.reject(error);
        },
      },
    });
  } catch (error) {
    throw new HqError('not_running', `no hq console answers at ${path}: start it with hq console in your own terminal (${error instanceof Error ? error.message : String(error)})`);
  }
  const raw = await reply.promise;
  const json = raw === '' ? 'null' : raw;
  const parsed = ControlReplySchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    throw new HqError('bad_answer', `the console's control socket gave a reply hq cannot read: ${raw.slice(0, 80)}`);
  }
  return parsed.data;
}
