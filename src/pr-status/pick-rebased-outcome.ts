import { formatChangedFiles } from './format-changed-files.ts';
import type { DiffPatchID } from './read-diff-patch-id.ts';

export interface RebasedReads {
  slug: string;
  pr: number;
  oldHead: string;
  newHead: string;
  oldPatchID: DiffPatchID;
  newPatchID: DiffPatchID;

  // Null when git could not compare the files one by one, or was not asked to.
  changed: string[] | null;

  // The changed files the new diff no longer touches because the base now holds them as the old
  // head had them, as a stacked parent's files once the parent merges.
  landed: readonly string[];
}

export type RebasedOutcome = { kind: 'carry'; patchID: string; landed: number } | { kind: 'refuse'; code: 'git_unreadable' | 'not_carried'; message: string };

export function pickRebasedOutcome(reads: RebasedReads): RebasedOutcome {
  const oldPatchID = reads.oldPatchID;
  const newPatchID = reads.newPatchID;
  if (oldPatchID.kind === 'patch-id' && newPatchID.kind === 'patch-id' && oldPatchID.id === newPatchID.id) {
    return { kind: 'carry', patchID: oldPatchID.id, landed: 0 };
  }
  const changed = reads.changed?.filter((path) => !reads.landed.includes(path)) ?? null;
  if (newPatchID.kind === 'patch-id' && reads.landed.length > 0 && changed?.length === 0) {
    return { kind: 'carry', patchID: newPatchID.id, landed: reads.landed.length };
  }
  const where = `${reads.slug}#${reads.pr}`;
  const diffs = [
    { head: reads.oldHead, read: oldPatchID },
    { head: reads.newHead, read: newPatchID },
  ];
  const unread = diffs.filter((diff) => diff.read.kind === 'unreadable').map((diff) => `the diff at ${diff.head.slice(0, 7)}`);
  if (unread.length > 0) {
    return { kind: 'refuse', code: 'git_unreadable', message: `hq could not read ${unread.join(' or ')} of ${where} in its checkout, so the lgtm is not carried and nothing is recorded` };
  }
  const empty = diffs.filter((diff) => diff.read.kind === 'empty').map((diff) => diff.head.slice(0, 7));
  if (empty.length > 0) {
    const diff = empty.length === 1 ? `the diff at ${empty.join('')} is empty` : `the diffs at ${empty.join(' and ')} are empty`;
    return { kind: 'refuse', code: 'not_carried', message: `${diff} against the base of ${where}, so the lgtm is not carried and nothing is recorded` };
  }
  return { kind: 'refuse', code: 'not_carried', message: `the diff of ${where} at ${reads.newHead.slice(0, 7)} is not the one the owner approved at ${reads.oldHead.slice(0, 7)} (${formatDifference(changed)}); the lgtm is not carried and needs the owner's answer at the new head` };
}

function formatDifference(changed: string[] | null): string {
  if (changed === null) {
    return 'the files could not be compared one by one';
  }
  if (changed.length === 0) {
    return "the whole-diff patch-ids differ though no single file's does, as a change of file mode or a rename makes";
  }
  return `changed: ${formatChangedFiles(changed)}`;
}
