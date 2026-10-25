import { HqError } from './errors.ts';

export function parseOneFlag(values: readonly string[] | undefined, name: string): string | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  if (values.length > 1) {
    throw new HqError('bad_args', `give --${name} once, not ${values.length} times`);
  }
  return values[0];
}
