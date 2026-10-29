import { readMergeBase } from '../noslop/read-merge-base.ts';
import { readPRPatchID } from '../noslop/read-pr-patch-id.ts';
import type { Runner } from '../runner/types.ts';

export type DiffPatchID = { kind: 'patch-id'; id: string } | { kind: 'empty' } | { kind: 'unreadable' };

export async function readDiffPatchID(run: Runner, directory: string, base: string, head: string): Promise<DiffPatchID> {
  const id = await readPRPatchID(run, directory, base, head);
  if (id !== null) {
    return { kind: 'patch-id', id };
  }
  return (await probeEmptyDiff(run, directory, base, head)) ? { kind: 'empty' } : { kind: 'unreadable' };
}

async function probeEmptyDiff(run: Runner, directory: string, base: string, head: string): Promise<boolean> {
  const mergeBase = await readMergeBase(run, directory, base, head);
  if (mergeBase === null) {
    return false;
  }
  const diff = await run(['git', 'diff', '--quiet', mergeBase, head], { cwd: directory });
  return diff.code === 0;
}
