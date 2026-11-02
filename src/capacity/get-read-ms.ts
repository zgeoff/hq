import { READ_MS } from './read-ms.ts';
import type { CapacityProbe } from './types.ts';

export function getReadMS(p: CapacityProbe): number {
  return p.readMs ?? READ_MS;
}
