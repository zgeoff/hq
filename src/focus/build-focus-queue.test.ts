import { expect, test } from 'bun:test';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { buildFocusQueue } from './build-focus-queue.ts';
import { parseFocusTerms } from './parse-focus-terms.ts';

test('it takes the terms in order, then any other eligible work', () => {
  const issues = [
    buildReadyIssue('GEO-9801', { type: 'Feature', labels: ['vers'] }),
    buildReadyIssue('GEO-9802', { type: 'Chore', projectLabels: ['maintenance'] }),
    buildReadyIssue('GEO-9803', { type: 'Bug' }),
  ];

  const queue = buildFocusQueue(issues, parseFocusTerms('bug,maintenance'), new Set());

  expect(queue.map((entry) => [entry.issue.identifier, entry.term])).toStrictEqual([
    ['GEO-9803', 0],
    ['GEO-9802', 1],
    ['GEO-9801', null],
  ]);
});

test('inside a term it orders by priority with none last, then enabler, then quality, then the oldest', () => {
  const issues = [
    buildReadyIssue('GEO-9801', { priority: 0, createdAt: '2026-09-01T00:00:00.000Z' }),
    buildReadyIssue('GEO-9802', { priority: 3, createdAt: '2026-10-02T00:00:00.000Z' }),
    buildReadyIssue('GEO-9803', { priority: 3, createdAt: '2026-10-01T00:00:00.000Z' }),
    buildReadyIssue('GEO-9804', { priority: 3, labels: ['quality'], createdAt: '2026-10-05T00:00:00.000Z' }),
    buildReadyIssue('GEO-9805', { priority: 3, labels: ['enabler'], createdAt: '2026-10-06T00:00:00.000Z' }),
    buildReadyIssue('GEO-9806', { priority: 1, createdAt: '2026-10-07T00:00:00.000Z' }),
  ];

  const queue = buildFocusQueue(issues, [], new Set());

  expect(queue.map((entry) => entry.issue.identifier)).toStrictEqual(['GEO-9806', 'GEO-9805', 'GEO-9804', 'GEO-9803', 'GEO-9802', 'GEO-9801']);
});

test('it leaves out issues on the board and Design issues', () => {
  const issues = [buildReadyIssue('GEO-9801'), buildReadyIssue('GEO-9802', { type: 'Design' }), buildReadyIssue('GEO-9803')];

  const queue = buildFocusQueue(issues, [], new Set(['GEO-9801']));

  expect(queue.map((entry) => entry.issue.identifier)).toStrictEqual(['GEO-9803']);
});

test('a term matches only issues that match every filter in it', () => {
  const issues = [
    buildReadyIssue('GEO-9801', { project: 'kettle roadmap', labels: ['nixie', 'widgets'], priority: 2 }),
    buildReadyIssue('GEO-9802', { project: 'kettle roadmap', labels: ['nixie'], priority: 2 }),
    buildReadyIssue('GEO-9803', { project: 'kettle roadmap', labels: ['nixie', 'widgets'], priority: 3 }),
    buildReadyIssue('GEO-9804', { project: 'kettle roadmap', labels: ['nixie', 'widgets'], priority: 2, type: 'Bug' }),
  ];

  const queue = buildFocusQueue(issues, parseFocusTerms('roadmap:nixie:label=widgets:high+:project=Kettle Roadmap'), new Set());

  expect(queue.filter((entry) => entry.term === 0).map((entry) => entry.issue.identifier)).toStrictEqual(['GEO-9801']);
});
