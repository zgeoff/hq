import { HqError } from '../errors.ts';
import type { DefsSource } from '../prompts/defs-sources.ts';
import { DEFS_SOURCES } from '../prompts/defs-sources.ts';
import { isDefsSource } from '../prompts/is-defs-source.ts';

export function parseSource(raw: string): DefsSource {
  if (isDefsSource(raw)) return raw;
  throw new HqError('bad_args', `the source must be ${Object.keys(DEFS_SOURCES).join(' or ')}`);
}
