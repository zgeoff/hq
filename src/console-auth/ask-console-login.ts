import { HqError } from '../errors.ts';

// Asks the running console to print a new login link on its own terminal, and returns its reply.
export async function askConsoleLogin(path: string): Promise<string> {
  const reply = Promise.withResolvers<string>();
  let answer = '';
  try {
    await Bun.connect({
      unix: path,
      socket: {
        open(socket) {
          socket.write('login\n');
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
  return await reply.promise;
}
