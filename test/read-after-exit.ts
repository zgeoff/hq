// A stand-in answer that arrives through a child process exit, as I/O does, not through a timer.
export async function readAfterExit<T>(value: T, seconds = 0.2): Promise<T> {
  await Bun.spawn(['sleep', String(seconds)]).exited;
  return value;
}
