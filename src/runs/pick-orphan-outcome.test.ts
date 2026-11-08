import { expect, test } from 'bun:test';
import { pickOrphanOutcome } from './pick-orphan-outcome.ts';

test.each([
  { title: 'forgets a local session with its work pushed', work: { state: 'pushed' }, place: 'local', expected: { kind: 'forget', destroyImp: false } },
  { title: 'forgets an imp session with its work pushed and destroys the imp', work: { state: 'pushed' }, place: 'imp', expected: { kind: 'forget', destroyImp: true } },
  {
    title: 'keeps a local session with unpushed work and says why',
    work: { state: 'unpushed', detail: 'one commit' },
    place: 'local',
    expected: { kind: 'keep', reason: 'its working directory holds unpushed work (one commit), so the session stays' },
  },
  {
    title: 'keeps an imp session whose check failed and says why',
    work: { state: 'unknown', detail: 'imp asleep' },
    place: 'imp',
    expected: { kind: 'keep', reason: 'the unpushed-work check could not run (imp asleep), so the imp stays' },
  },
] as const)('it $title', (row) => {
  expect(pickOrphanOutcome('0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', row.work, row.place)).toStrictEqual(row.expected);
});
