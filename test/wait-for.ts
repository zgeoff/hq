interface WaitForOptions {
  timeoutMs?: number;
  pollMs?: number;
}

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
