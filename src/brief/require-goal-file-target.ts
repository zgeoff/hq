import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import type { BriefFiles } from './types.ts';

// Refuses a --goal-file path whose directory is missing, or which names something that is not a
// regular file (a directory, or a link, which hq would write through).
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
