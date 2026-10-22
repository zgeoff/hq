import { READ_MS } from './read-ms.ts';
import type { CapacityProbe } from './types.ts';

// The deadline of each read.
export function getReadMS(p: CapacityProbe): number {
  return p.readMs ?? READ_MS;
}
