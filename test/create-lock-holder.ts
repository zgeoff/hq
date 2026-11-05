export interface LockHolder {
  readonly pid: number;

  // Kills the holder with SIGKILL and waits for its exit.
  readonly kill: () => Promise<void>;
}

const withFileLockURL = import.meta.resolve('@zgeoff/std/with-file-lock');

// Another process that holds the lock until it is killed, as a review or a pin in another hq does.
export async function createLockHolder(lockPath: string): Promise<LockHolder> {
  const script = [
    `const { withFileLock } = await import(${JSON.stringify(withFileLockURL)});`,
    `await withFileLock(${JSON.stringify(lockPath)}, async () => {`,
    "  console.log('held');",
    '  await new Promise(() => setInterval(() => {}, 60_000));',
    '});',
  ].join('\n');
  const holder = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  const firstLine = await readFirstLine(holder.stdout);
  if (firstLine !== 'held') {
    holder.kill('SIGKILL');
    throw new Error(`the lock holder could not take ${lockPath}: ${firstLine} ${await new Response(holder.stderr).text()}`);
  }
  return {
    pid: holder.pid,
    kill: async () => {
      if (holder.exitCode === null && holder.signalCode === null) {
        holder.kill('SIGKILL');
      }
      await holder.exited;
    },
  };
}

async function readFirstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
    if (text.includes('\n')) {
      break;
    }
  }
  return text.split('\n')[0] ?? '';
}
