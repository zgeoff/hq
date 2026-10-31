import { lstatSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';

// Refuses a --goal-file path whose directory is missing, or which names something that is not a
// regular file (a directory, or a link, which hq would write through).
export function requireGoalFileTarget(path: string): void {
  const directory = dirname(path);
  if (!probeDirectory(directory)) {
    throw new HqError('bad_args', `--goal-file needs an existing directory: ${directory}`);
  }
  const isRegularFile = readIsRegularFile(path);
  if (isRegularFile === false) {
    throw new HqError('bad_args', `--goal-file would overwrite something that is not a regular file: ${path}`);
  }
}

function probeDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// null when nothing is there; otherwise whether it is a regular file.
function readIsRegularFile(path: string): boolean | null {
  try {
    return lstatSync(path).isFile();
  } catch {
    return null;
  }
}
