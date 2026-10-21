import { expect, test } from 'bun:test';
import { formatUnreadCommits } from './format-unread-commits.ts';

test('it lists an unnamed commit and an unclean merge with the advice for each kind', () => {
  expect(formatUnreadCommits('aaaa000000000000000000000000000000000001', [{ sha: 'cccc000000000000000000000000000000000002', kind: 'unnamed' }, { sha: 'dddd000000000000000000000000000000000004', kind: 'unclean-merge' }], 'This head cannot pass until those commits are answered, moved or checked.')).toBe(
    '2 commit(s) after the last review (aaaa000) are not accounted for: cccc000, dddd000 (merge). No lens has read them. This head cannot pass until those commits are answered, moved or checked. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it. noslop checks the conflict resolution of a merge in a fixes-only run, which has not checked this one yet: run hq review <repo> <pr> --fixes-only, and answer any finding it raises.',
  );
});

test('it lists at most 5 unread commits, then an ellipsis', () => {
  expect(formatUnreadCommits('aaaa000000000000000000000000000000000001', [{ sha: 'c100000', kind: 'unnamed' }, { sha: 'c200000', kind: 'unnamed' }, { sha: 'c300000', kind: 'unnamed' }, { sha: 'c400000', kind: 'unnamed' }, { sha: 'c500000', kind: 'unnamed' }, { sha: 'c600000', kind: 'unnamed' }], '')).toBe(
    '6 commit(s) after the last review (aaaa000) are not accounted for: c100000, c200000, c300000, c400000, c500000, …. No lens has read them. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.',
  );
});

test('it says noslop judged the resolution not sound for a rejected merge', () => {
  expect(formatUnreadCommits('aaaa000000000000000000000000000000000001', [{ sha: 'dddd000000000000000000000000000000000004', kind: 'rejected-merge' }], '')).toBe(
    '1 commit(s) after the last review (aaaa000) are not accounted for: dddd000 (merge). No lens has read them. noslop judged the conflict resolution of a merge not sound: fix it, then run hq review <repo> <pr> --fixes-only and answer any finding it raises.',
  );
});

test('it marks a commit below the review base and says to run a full review', () => {
  expect(formatUnreadCommits('aaaa000000000000000000000000000000000001', [{ sha: 'eeee000000000000000000000000000000000005', kind: 'unreviewed' }], '')).toBe(
    '1 commit(s) after the last review (aaaa000) are not accounted for: eeee000 (below the review base). No lens has read them. A commit below the base the last review read is in neither the base nor a merged PR, so no lens has read it in this PR: run a full review, hq review <repo> <pr>.',
  );
});
