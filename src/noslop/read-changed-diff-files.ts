import type { Runner } from '../runner/types.ts';
import type { DiffEnd } from './diff-end.ts';
import { listDiffFiles } from './list-diff-files.ts';
import { readFilePatchID } from './read-file-patch-id.ts';

export async function readChangedDiffFiles(run: Runner, directory: string, before: DiffEnd, after: DiffEnd): Promise<string[] | null> {
  const listed = await Promise.all([listDiffFiles(run, directory, before.from, before.to), listDiffFiles(run, directory, after.from, after.to)]);
  if (listed[0] === null || listed[1] === null) {
    return null;
  }
  const changed: string[] = [];
  for (const path of [...new Set([...listed[0], ...listed[1]])].toSorted()) {
    const was = await readFilePatchID(run, directory, before, path);
    const now = await readFilePatchID(run, directory, after, path);
    if (was === null || now === null) {
      return null;
    }
    if (was !== now) {
      changed.push(path);
    }
  }
  return changed;
}
