import { HqError } from '../errors.ts';
import type { DefsSource } from './defs-sources.ts';
import { DEFS_SOURCES } from './defs-sources.ts';
import { defsSourceFile } from './defs-source-file.ts';
import { isDefsSource } from './is-defs-source.ts';
import { rawDefsSource } from './raw-defs-source.ts';

export function defsSource(): DefsSource {
  const f = defsSourceFile();
  const v = rawDefsSource();
  if (v === null) {
    return 'hq';
  }
  if (isDefsSource(v)) return v;
  throw new HqError('bad_defs_source', `${f} says "${v.slice(0, 40)}"; it must be ${Object.keys(DEFS_SOURCES).join(' or ')} (hq defs use ...)`);
}
