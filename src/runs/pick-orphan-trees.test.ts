import { expect, test } from 'bun:test';
import { pickOrphanTrees } from './pick-orphan-trees.ts';

test('it forgets a pushed child and its pushed parent as separate trees, the child first', () => {
  const child = { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, issue: null, place: 'local', work: { state: 'pushed' } } as const;
  const parent = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'local', work: { state: 'pushed' } } as const;

  expect(pickOrphanTrees([child, parent])).toStrictEqual({
    kept: [],
    trees: [
      { root: child, children: [], destroyImp: false },
      { root: parent, children: [], destroyImp: false },
    ],
  });
});

test('it destroys the imp of a pushed imp child under a local parent', () => {
  const child = { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', locator: { targetID: 'imp-kettle' } }, issue: null, place: 'imp', work: { state: 'pushed' } } as const;
  const parent = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'local', work: { state: 'pushed' } } as const;

  expect(pickOrphanTrees([child, parent])).toStrictEqual({
    kept: [],
    trees: [
      { root: child, children: [], destroyImp: true },
      { root: parent, children: [], destroyImp: false },
    ],
  });
});

test('it keeps a child with unpushed work and its parent, and logs only the child', () => {
  const child = { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, issue: null, place: 'local', work: { state: 'unpushed', detail: 'one commit' } } as const;
  const parent = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'local', work: { state: 'pushed' } } as const;

  expect(pickOrphanTrees([child, parent])).toStrictEqual({
    kept: [
      {
        sessionID: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action: 'session-kept',
        data: { reason: 'its working directory holds unpushed work (one commit), so the session stays', issue: null },
        line: 'orphan session 0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa (kettle-helper) kept: its working directory holds unpushed work (one commit), so the session stays',
      },
    ],
    trees: [],
  });
});

test('it forgets a pushed child alone when its parent stays for an unchecked imp', () => {
  const child = { session: { id: '0000f004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: false, state: 'exited', parent: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, issue: null, place: 'local', work: { state: 'pushed' } } as const;
  const parent = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited' }, issue: 'GEO-601', place: 'imp', work: { state: 'unknown', detail: 'imp asleep' } } as const;

  expect(pickOrphanTrees([child, parent])).toStrictEqual({
    kept: [
      {
        sessionID: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action: 'session-kept',
        data: { reason: 'the unpushed-work check could not run (imp asleep), so the imp stays', issue: 'GEO-601' },
        line: 'orphan session 0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa (kettle-agent) kept: the unpushed-work check could not run (imp asleep), so the imp stays',
      },
    ],
    trees: [{ root: child, children: [], destroyImp: false }],
  });
});

test('it destroys the imp of a pushed imp root', () => {
  const root = { session: { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'exited', locator: { targetID: 'imp-kettle' } }, issue: 'GEO-601', place: 'imp', work: { state: 'pushed' } } as const;

  expect(pickOrphanTrees([root])).toStrictEqual({ kept: [], trees: [{ root, children: [], destroyImp: true }] });
});
