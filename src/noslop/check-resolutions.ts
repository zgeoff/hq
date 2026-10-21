import type { FixesOnlyBasisInput, UnreadCommit } from './check-fixes-only-basis.ts';
import { readMergeVerdicts } from './read-merge-verdicts.ts';

// Settles each unclean merge among the unread commits by noslop's summary marker: checked is
// accounted for, rejected is a rejected merge, any other stays unclean. The marker is read only
// when the commits hold an unclean merge.
export async function checkResolutions(input: FixesOnlyBasisInput, unread: UnreadCommit[]): Promise<UnreadCommit[]> {
  if (!unread.some((c) => c.kind === 'unclean-merge')) {
    return unread;
  }
  const verdicts = await readMergeVerdicts(input.run, input.slug, input.pr);
  return unread.flatMap((c): UnreadCommit[] => {
    if (c.kind !== 'unclean-merge') {
      return [c];
    }
    if (verdicts.rejected.has(c.sha)) {
      return [{ sha: c.sha, kind: 'rejected-merge' }];
    }
    return verdicts.checked.has(c.sha) ? [] : [c];
  });
}
