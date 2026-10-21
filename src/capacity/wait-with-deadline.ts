// A read that hangs fails its source, never the tick.
export async function waitWithDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error(`no answer in ${Math.round(ms / 1000)} s`)), ms)))]);
  } finally {
    clearTimeout(t);
  }
}
