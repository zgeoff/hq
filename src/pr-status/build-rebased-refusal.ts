import { HqError } from '../errors.ts';
import { formatChangedFiles } from './format-changed-files.ts';

export interface RebasedRefusal {
  slug: string;
  pr: number;
  oldHead: string;
  newHead: string;

  // The patch-id of each diff, null when git could not read it.
  oldPatchID: string | null;
  newPatchID: string | null;

  // The files whose diff differs between the two heads; null when git could not compare them.
  changed: string[] | null;
}

// Why the lgtm does not carry. A diff git cannot read is named as unreadable; two diffs that differ
// name each file whose own diff changed.
export function buildRebasedRefusal(refusal: RebasedRefusal): HqError {
  const where = `${refusal.slug}#${refusal.pr}`,
    old7 = refusal.oldHead.slice(0, 7),
    new7 = refusal.newHead.slice(0, 7),
    unread = [refusal.oldPatchID === null ? `the diff at ${old7}` : null, refusal.newPatchID === null ? `the diff at ${new7}` : null].filter((part) => part !== null);
  if (unread.length > 0) {
    return new HqError('git_unreadable', `hq could not read ${unread.join(' or ')} of ${where} in its checkout, so the lgtm is not carried and nothing is recorded`);
  }
  const files = refusal.changed === null || refusal.changed.length === 0 ? 'the files could not be compared one by one' : `changed: ${formatChangedFiles(refusal.changed)}`;
  return new HqError('not_carried', `the diff of ${where} at ${new7} is not the one the owner approved at ${old7} (${files}); the lgtm is not carried and needs the owner's answer at the new head`);
}
