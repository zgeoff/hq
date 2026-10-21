import { HqError } from '../errors.ts';
import { SOURCES } from './sources.ts';
import type { Source } from './types.ts';

export function getSource(repo: string): Source {
  const source = SOURCES[repo];
  if (!source) {
    throw new HqError('bad_source', `${repo} has no release source`);
  }
  return source;
}
