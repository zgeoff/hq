import { expect, test } from 'bun:test';
import { pickRebasedHead } from './pick-rebased-head.ts';

test('it maps the reviewed head to the last paired branch commit when each patch id matches', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a2',
    reviewed: [
      { sha: 'a1', parents: ['a0'] },
      { sha: 'a2', parents: ['a1'] },
    ],
    branch: [
      { sha: 'b1', parents: ['b0'] },
      { sha: 'b2', parents: ['b1'] },
      { sha: 'b3', parents: ['b2'] },
    ],
    patchIDs: new Map([
      ['a1', 'p1'],
      ['a2', 'p2'],
      ['b1', 'p1'],
      ['b2', 'p2'],
      ['b3', 'p3'],
    ]),
  });

  expect(result).toStrictEqual({ kind: 'mapped', head: 'b2' });
});

test('it refuses a reviewed range that holds no commit past the base', () => {
  const result = pickRebasedHead({ reviewedHead: 'abcdef0123', reviewed: [], branch: [{ sha: 'b1', parents: ['b0'] }], patchIDs: new Map() });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the reviewed head abcdef0 holds no commit past the base' });
});

test('it refuses a reviewed range that holds a merge', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a2',
    reviewed: [{ sha: 'a2aaaaaaa', parents: ['a1', 'm1'] }],
    branch: [{ sha: 'b1', parents: ['b0'] }],
    patchIDs: new Map(),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the merge a2aaaaa needs a full review' });
});

test('it refuses a branch that holds a merge where a reviewed commit maps', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a1',
    reviewed: [{ sha: 'a1', parents: ['a0'] }],
    branch: [{ sha: 'b1bbbbbbb', parents: ['b0', 'm1'] }],
    patchIDs: new Map([['a1', 'p1']]),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the merge b1bbbbb needs a full review' });
});

test('it refuses a branch that holds fewer commits past the base than the reviewed range', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a2',
    reviewed: [
      { sha: 'a1', parents: ['a0'] },
      { sha: 'a2', parents: ['a1'] },
    ],
    branch: [{ sha: 'b1', parents: ['b0'] }],
    patchIDs: new Map(),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the branch holds 1 of the 2 reviewed commits past the base' });
});

test('it pairs an empty reviewed commit with an empty branch commit in the same place', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a2',
    reviewed: [
      { sha: 'a1', parents: ['a0'] },
      { sha: 'a2', parents: ['a1'] },
    ],
    branch: [
      { sha: 'b1', parents: ['b0'] },
      { sha: 'b2', parents: ['b1'] },
    ],
    patchIDs: new Map([
      ['a2', 'p2'],
      ['b2', 'p2'],
    ]),
  });

  expect(result).toStrictEqual({ kind: 'mapped', head: 'b2' });
});

test('it refuses an empty reviewed commit whose branch commit in the same place has a patch', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a1',
    reviewed: [{ sha: 'a1aaaaaaa', parents: ['a0'] }],
    branch: [{ sha: 'b1', parents: ['b0'] }],
    patchIDs: new Map([['b1', 'p1']]),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the rebase changed the patch of the reviewed commit a1aaaaa, or dropped it' });
});

test('it refuses a reviewed commit whose patch the rebase changed', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a1',
    reviewed: [{ sha: 'a1aaaaaaa', parents: ['a0'] }],
    branch: [{ sha: 'b1', parents: ['b0'] }],
    patchIDs: new Map([
      ['a1aaaaaaa', 'p1'],
      ['b1', 'p9'],
    ]),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the rebase changed the patch of the reviewed commit a1aaaaa, or dropped it' });
});

test('it refuses a branch whose commits keep the reviewed patches out of order', () => {
  const result = pickRebasedHead({
    reviewedHead: 'a2',
    reviewed: [
      { sha: 'a1aaaaaaa', parents: ['a0'] },
      { sha: 'a2', parents: ['a1'] },
    ],
    branch: [
      { sha: 'b1', parents: ['b0'] },
      { sha: 'b2', parents: ['b1'] },
    ],
    patchIDs: new Map([
      ['a1aaaaaaa', 'p1'],
      ['a2', 'p2'],
      ['b1', 'p2'],
      ['b2', 'p1'],
    ]),
  });

  expect(result).toStrictEqual({ kind: 'refused', why: 'the branch drops or reorders the reviewed commit a1aaaaa, so the order does not match' });
});
