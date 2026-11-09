import { setMeta } from '../set-meta.ts';
import type { MetaDeps } from './types.ts';

interface MetaInput {
  key: string;
  value: string;
}

export function seedMeta(deps: MetaDeps, input: MetaInput): void {
  setMeta(deps.db, input.key, input.value);
}
