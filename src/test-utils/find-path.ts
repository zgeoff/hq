import { isRecord } from '@zgeoff/std';

export function findPath(value: unknown, ...path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === 'number') {
      current = Array.isArray(current) ? current[key] : undefined;
    } else {
      current = isRecord(current) ? current[key] : undefined;
    }
  }
  return current;
}
