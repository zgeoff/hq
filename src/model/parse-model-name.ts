import { HqError } from '../errors.ts';

const USAGE = 'usage: hq model set <model>  (lowercase letters, digits, ".", "-" and "[]", starting with a letter or digit, such as fable, opus or opus[1m])';
const MODEL_NAME = /^[a-z0-9][a-z0-9.[\]-]*$/u;

export function parseModelName(args: readonly string[]): string {
  const [name, ...extra] = args;
  if (name === undefined || extra.length > 0 || !MODEL_NAME.test(name)) {
    throw new HqError('bad_args', USAGE);
  }
  return name;
}
