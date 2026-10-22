import { HqError } from '../errors.ts';

const NAME_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;

// Both names are repo names under zgeoff: they go into SQL as parameters and into a URL prefix.
export function checkArchiveNames(from: string, to: string): void {
  for (const name of [from, to]) {
    if (!NAME_SHAPE.test(name)) {
      throw new HqError('bad_args', `${JSON.stringify(name)} is not a repo name`);
    }
  }
  if (from === to) {
    throw new HqError('bad_args', `both repo names are ${from}: nothing to re-key`);
  }
}
