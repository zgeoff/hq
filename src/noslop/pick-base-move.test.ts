import { expect, test } from 'bun:test';
import { pickBaseMove, pickComparedReview } from './pick-base-move.ts';

test.each([
  ['no full review yet', null, { headRefOid: 'b2b2b2b', baseRefName: 'main' }],
  ['a full review with no head', { head: null, patch_id: 'kettle-diff' }, { headRefOid: 'b2b2b2b', baseRefName: 'main' }],
  ['a full review from before patch-ids', { head: 'a1a1a1a', patch_id: null }, { headRefOid: 'b2b2b2b', baseRefName: 'main' }],
  ['a full review whose diff git could not read', { head: 'a1a1a1a', patch_id: '' }, { headRefOid: 'b2b2b2b', baseRefName: 'main' }],
  ['refs GitHub did not give', { head: 'a1a1a1a', patch_id: 'kettle-diff' }, null],
  ['the head the full review read', { head: 'a1a1a1a', patch_id: 'kettle-diff' }, { headRefOid: 'a1a1a1a', baseRefName: 'main' }],
])('it compares with no review given %s', (_label, last, refs) => {
  expect(pickComparedReview(last, refs)).toBeNull();
});

test('it compares a new head with the last full review', () => {
  expect(pickComparedReview({ head: 'a1a1a1a', patch_id: 'kettle-diff' }, { headRefOid: 'b2b2b2b', baseRefName: 'main' })).toStrictEqual({ head: 'a1a1a1a', patchId: 'kettle-diff' });
});

test.each([
  ['the same PR diff', 'kettle-diff', { reviewed: 'a1a1a1a', head: 'b2b2b2b', patchId: 'kettle-diff' }],
  ['another PR diff', 'kettle-diff-with-lid', null],
  ['a PR diff git could not read', null, null],
])('a new head with %s is a base move only when the diff is the same', (_label, patchID, expected) => {
  expect(pickBaseMove({ head: 'a1a1a1a', patchId: 'kettle-diff' }, { headRefOid: 'b2b2b2b', baseRefName: 'main' }, patchID)).toStrictEqual(expected);
});
