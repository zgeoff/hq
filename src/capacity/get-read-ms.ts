import { READ_MS } from './read-ms.ts';
import type { CapacityProbe } from './types.ts';

export function getReadMS(probe: Pick<CapacityProbe, 'readMs'>): number {
  return probe.readMs ?? READ_MS;
}
