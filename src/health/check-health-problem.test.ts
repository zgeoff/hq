import { expect, test } from 'bun:test';
import { checkHealthProblem, readHealthProblemState } from './check-health-problem.ts';

test('#checkHealthProblem refuses to escalate a problem that was only reported', () => {
  expect(() => checkHealthProblem('disk', 'escalated', 'reported')).toThrow('health problem disk is reported: escalated needs asked');
});

test('#checkHealthProblem refuses to ask about a problem already open', () => {
  expect(() => checkHealthProblem('state-size:kettle.md', 'asked', 'asked')).toThrow('health problem state-size:kettle.md is asked: asked needs none');
});

test('#readHealthProblemState reads each stored entry shape as its state', () => {
  const open = {
    disk: { since: '2026-10-14T00:00:00Z', line: 'disk /: 2.0 GiB free' },
    'state-size:kettle.md': { since: '2026-10-14T00:00:00Z', line: 'kettle', asked: 'z-kettle' },
    'state-size:teapot.md': { since: '2026-10-14T00:00:00Z', line: 'teapot', asked: 'z-teapot', escalated: true },
  };

  expect(['missing', 'disk', 'state-size:kettle.md', 'state-size:teapot.md'].map((key) => readHealthProblemState(open, key))).toStrictEqual(['none', 'reported', 'asked', 'escalated']);
});
