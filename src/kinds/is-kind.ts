import type { Kind } from './kinds.ts';
import { KINDS } from './kinds.ts';

export function isKind(value: string): value is Kind {
  return value === 'other' || KINDS.some((kind) => kind === value);
}
