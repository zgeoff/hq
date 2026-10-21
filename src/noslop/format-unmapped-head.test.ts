import { expect, test } from 'bun:test';
import { formatUnmappedHead } from './format-unmapped-head.ts';

test('it names the last review, the reason and the advice', () => {
  expect(formatUnmappedHead('0123456789abcdef', 'the branch holds 1 of the 2 reviewed commits past the base', '')).toBe('the last review (0123456) does not map onto the rebased branch: the branch holds 1 of the 2 reviewed commits past the base. Rebase without changing or dropping a reviewed commit. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.');
});

test('it puts the verdict between the reason and the advice', () => {
  expect(formatUnmappedHead('0123456789abcdef', 'the repo holds no commit of it', 'This head cannot pass.')).toBe('the last review (0123456) does not map onto the rebased branch: the repo holds no commit of it. This head cannot pass. Rebase without changing or dropping a reviewed commit. A commit pushed after the last round merges only as a fix: answer its finding with fixed <sha>. Fix each finding in one commit, and squash the fix locally before you push. Move other code to a new PR, which gets its own first round, or drop it.');
});
