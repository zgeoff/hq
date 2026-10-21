import { HqError } from '../errors.ts';

// A step that hasn't settled by its deadline is given up on; the loop goes on.
export function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new HqError('timed_out', `${what} did not finish in ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, late]).finally(() => t && clearTimeout(t));
}
