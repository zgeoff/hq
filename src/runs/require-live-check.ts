import { HqError } from '../errors.ts';

export function requireLiveCheck(v: string): void {
  if (v !== 'owed' && v !== 'none') {
    throw new HqError('bad_args', '--check must be owed or none');
  }
}
