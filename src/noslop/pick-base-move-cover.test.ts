import { expect, test } from 'bun:test';
import { pickBaseMoveCover } from './pick-base-move-cover.ts';

test('it gives the reviewed base and patch-id when the newest run at the head is a base move with the reviewed diff', () => {
  const rows = [
    { head: 'aaaa000', base: 'base000', confirm: 0, base_move: 0, patch_id: 'p1' },
    { head: 'bbbb000', base: 'base111', confirm: 1, base_move: 1, patch_id: 'p1' },
  ];

  expect(pickBaseMoveCover(rows, 'aaaa000', 'bbbb000')).toStrictEqual({ stored: true, reviewBase: 'base000', patchId: 'p1' });
});

test('it refuses when a later run at the head was not a base move', () => {
  const rows = [
    { head: 'aaaa000', base: 'base000', confirm: 0, base_move: 0, patch_id: 'p1' },
    { head: 'bbbb000', base: 'base111', confirm: 1, base_move: 1, patch_id: 'p1' },
    { head: 'bbbb000', base: 'base111', confirm: 1, base_move: 0, patch_id: 'p1' },
  ];

  expect(pickBaseMoveCover(rows, 'aaaa000', 'bbbb000')).toStrictEqual({ stored: false, why: 'hq has no base-move run recorded at bbbb000' });
});

test('it refuses when the only run at the summary head checked fixes and was no full review', () => {
  const rows = [
    { head: 'aaaa000', base: 'base000', confirm: 1, base_move: 0, patch_id: 'p1' },
    { head: 'bbbb000', base: 'base111', confirm: 1, base_move: 1, patch_id: 'p1' },
  ];

  expect(pickBaseMoveCover(rows, 'aaaa000', 'bbbb000')).toStrictEqual({ stored: false, why: 'hq has no full review with a patch-id recorded at aaaa000' });
});

test('it refuses when the full review at the summary head has no patch-id', () => {
  const rows = [
    { head: 'aaaa000', base: 'base000', confirm: 0, base_move: 0, patch_id: null },
    { head: 'bbbb000', base: 'base111', confirm: 1, base_move: 1, patch_id: 'p1' },
  ];

  expect(pickBaseMoveCover(rows, 'aaaa000', 'bbbb000')).toStrictEqual({ stored: false, why: 'hq has no full review with a patch-id recorded at aaaa000' });
});
