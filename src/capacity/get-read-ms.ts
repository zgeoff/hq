import { READ_MS } from './read-ms.ts';
import type { CapacityProbe } from './types.ts';

export function getReadMS(p: Pick<CapacityProbe, 'readMs'>): number {
  return p.readMs ?? READ_MS;
}
