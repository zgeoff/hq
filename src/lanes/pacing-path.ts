import { LANES } from './lanes.ts';

export function pacingPath(): string {
  return `${LANES.capacityScript().replace(/\/scripts\/[^/]+$/, '')}/pacing.json`;
}
