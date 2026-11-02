import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import type { BriefFiles } from './types.ts';

// A link is refused, since hq would write through it.
export function requireGoalFileTarget(files: BriefFiles, path: string): void {
  const directory = dirname(path);
  if (files.readKind(directory) !== 'directory') {
    throw new HqError('bad_args', `--goal-file needs an existing directory: ${directory}`);
  }
  const kind = files.readLinkKind(path);
  if (kind !== 'missing' && kind !== 'file') {
    throw new HqError('bad_args', `--goal-file would overwrite something that is not a regular file: ${path}`);
  }
}
