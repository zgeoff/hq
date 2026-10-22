import type { Judged } from './types.ts';

export function buildMiss<T>(why: string, failedCalls = 0): Judged<T> {
  return { value: null, why, failedCalls };
}
