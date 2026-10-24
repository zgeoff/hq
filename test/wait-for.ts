interface WaitForOptions {
  timeoutMs?: number;
  pollMs?: number;
}

// Polls `check` until it holds, so a test waits on a condition and never on a fixed delay. Past
// timeoutMs it throws, naming what it waited for.
export async function waitFor(what: string, check: () => boolean | Promise<boolean>, options: WaitForOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const pollMs = options.pollMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) {
      throw new Error(`waited ${timeoutMs} ms for ${what}`);
    }
    await Bun.sleep(pollMs);
  }
}
