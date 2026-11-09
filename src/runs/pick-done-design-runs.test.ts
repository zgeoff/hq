import { expect, test } from 'bun:test';
import type { DesignRun } from '../lanes/read-design-runs.ts';
import { pickDoneDesignRuns } from './pick-done-design-runs.ts';

test.each<{ name: string; runs: DesignRun[]; done: string[]; expected: string[] }>([
  {
    name: 'a working run whose issue is Done',
    runs: [{ issue: 'GEO-12', state: 'working', lane: 'with-geoff' }],
    done: ['GEO-12'],
    expected: ['GEO-12'],
  },
  {
    name: 'no run that is already done or dropped',
    runs: [
      { issue: 'GEO-12', state: 'done', lane: 'agent' },
      { issue: 'GEO-13', state: 'dropped', lane: 'with-geoff' },
    ],
    done: ['GEO-12', 'GEO-13'],
    expected: [],
  },
  {
    name: 'no run whose issue is not Done',
    runs: [{ issue: 'GEO-12', state: 'blocked', lane: 'agent' }],
    done: ['GEO-99'],
    expected: [],
  },
  {
    name: 'the open runs whose issues are Done, sorted by issue',
    runs: [
      { issue: 'GEO-30', state: 'working', lane: 'agent' },
      { issue: 'GEO-14', state: 'blocked', lane: 'with-geoff' },
      { issue: 'GEO-21', state: 'working', lane: 'agent' },
    ],
    done: ['GEO-30', 'GEO-14'],
    expected: ['GEO-14', 'GEO-30'],
  },
])('it picks $name', (row) => {
  expect(pickDoneDesignRuns(row.runs, new Set(row.done))).toStrictEqual(row.expected);
});
