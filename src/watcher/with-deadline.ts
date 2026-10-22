import { HqError } from '../errors.ts';

// A step that hasn't settled by its deadline is given up on; the loop goes on. With `abandon`, the
// deadline also aborts it, so a step that watches its signal stops its own work.
export function withDeadline<T>(step: Promise<T>, timeoutMs: number, what: string, abandon?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abandon?.abort();
      reject(new HqError('timed_out', `${what} did not finish in ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
  });
  return Promise.race([step, late]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}
