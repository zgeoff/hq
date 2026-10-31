import { expect, test } from 'bun:test';
import { buildReviewPointer } from './build-review-pointer.ts';

test('it points at the review lines pinned to the sha, and names the repo for <repo>', () => {
  expect(buildReviewPointer('kettle', 'c'.repeat(40))).toBe(
    `Before you write code, read noslop's rules, with <repo> as kettle: gh api 'repos/zgeoff/hq/contents/agent-kit/review-lines.md?ref=${'c'.repeat(40)}' -H 'Accept: application/vnd.github.raw'`,
  );
});
