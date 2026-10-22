import { HqError } from '../errors.ts';

export function assertPR(pr: number): void {
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new HqError('bad_args', 'pr must be a positive number');
  }
}
