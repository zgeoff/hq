import { setMeta } from '../set-meta.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

interface MetaInput {
  key: string;
  value: string;
}

export function seedMeta(deps: TestDeps, input: MetaInput): void {
  setMeta(deps.db, input.key, input.value);
}
