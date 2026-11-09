import type { StoredAreaLabels } from '../area-labels-schema.ts';
import { writeAreaLabels } from '../write-area-labels.ts';
import { buildMockAreaLabels } from './build-mock-area-labels.ts';
import type { FocusDeps } from './types.ts';

export function seedAreaLabels(deps: FocusDeps, input: Partial<StoredAreaLabels> = {}): StoredAreaLabels {
  const labels = buildMockAreaLabels(input);
  writeAreaLabels(deps.db, labels);

  return labels;
}
