import type { RefusalFileRow } from '../write-refusal-file.ts';
import { writeRefusalFile } from '../write-refusal-file.ts';
import { buildMockRefusalFile } from './build-mock-refusal-file.ts';
import type { RefusalsDeps } from './types.ts';

export function seedRefusalFile(deps: RefusalsDeps, input: Partial<RefusalFileRow> = {}): RefusalFileRow {
  const file = buildMockRefusalFile(input);
  writeRefusalFile(deps.db, file);

  return file;
}
