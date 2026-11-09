import { seedAreaLabels } from './seed-area-labels.ts';
import type { FocusDeps } from './types.ts';

export function buildFocusSeeder(deps: FocusDeps) {
  return {
    areaLabels: (input?: Parameters<typeof seedAreaLabels>[1]) => seedAreaLabels(deps, input),
  };
}
