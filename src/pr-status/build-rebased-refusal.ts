import { HqError } from '../errors.ts';
import { formatChangedFiles } from './format-changed-files.ts';
import type { DiffPatchID } from './read-diff-patch-id.ts';

export interface RebasedRefusal {
  slug: string;
  pr: number;
  oldHead: string;
  newHead: string;
  oldPatchID: DiffPatchID;
  newPatchID: DiffPatchID;

  // Null when git could not compare the files one by one.
  changed: string[] | null;
}

export function buildRebasedRefusal(refusal: RebasedRefusal): HqError {
  const where = `${refusal.slug}#${refusal.pr}`;
  const diffs = [
    { head: refusal.oldHead, read: refusal.oldPatchID },
    { head: refusal.newHead, read: refusal.newPatchID },
  ];
  const unread = diffs.filter((diff) => diff.read.kind === 'unreadable').map((diff) => `the diff at ${diff.head.slice(0, 7)}`);
  if (unread.length > 0) {
    return new HqError('git_unreadable', `hq could not read ${unread.join(' or ')} of ${where} in its checkout, so the lgtm is not carried and nothing is recorded`);
  }
  const empty = diffs.filter((diff) => diff.read.kind === 'empty').map((diff) => diff.head.slice(0, 7));
  if (empty.length > 0) {
    const diff = empty.length === 1 ? `the diff at ${empty.join('')} is empty` : `the diffs at ${empty.join(' and ')} are empty`;
    return new HqError('not_carried', `${diff} against the base of ${where}, so the lgtm is not carried and nothing is recorded`);
  }
  const old7 = refusal.oldHead.slice(0, 7);
  const new7 = refusal.newHead.slice(0, 7);
  return new HqError('not_carried', `the diff of ${where} at ${new7} is not the one the owner approved at ${old7} (${formatDifference(refusal.changed)}); the lgtm is not carried and needs the owner's answer at the new head`);
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
