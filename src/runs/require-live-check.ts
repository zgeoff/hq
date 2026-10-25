import { HqError } from '../errors.ts';
import type { LiveCheck } from './types.ts';

export function requireLiveCheck(value: string): asserts value is LiveCheck {
  if (value !== 'owed' && value !== 'none') {
    throw new HqError('bad_args', '--check must be owed or none');
  }
}
