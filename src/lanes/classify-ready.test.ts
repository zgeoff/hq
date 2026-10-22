import { expect, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { classifyReady } from './classify-ready.ts';
import { validateLaneRules } from './validate-lane-rules.ts';

test('it counts a cleanup-set issue in a nixie project only in cleanup', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-1437', { project: 'nixie' })], rules);

  expect(result.counts['cleanup']).toBe(1);
  expect(result.counts['flexible']).toBe(0);
});

test('it lets the process label beat the project lane', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-2000', { project: 'atc roadmap', labels: ['process'] })], rules);

  expect(result.counts['process']).toBe(1);
  expect(result.counts['atc']).toBe(0);
});

test('it counts a child of the memory issue in memory', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-2001', { parent: 'GEO-1319' }), buildReadyIssue('GEO-259')], rules);

  expect(result.counts['memory']).toBe(2);
});

test('it skips hq projects and Design issues with their reasons, launches nixie-definitions maintenance, and still counts every issue in the total', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady(
    [buildReadyIssue('GEO-3001', { project: 'hq roadmap' }), buildReadyIssue('GEO-3002', { labels: ['Design'], project: 'atc roadmap' }), buildReadyIssue('GEO-3003', { project: 'nixie-definitions maintenance' }), buildReadyIssue('GEO-3004', { project: 'cloud roadmap' })],
    rules,
  );

  expect(result.skipped).toStrictEqual([
    { issue: 'GEO-3001', reason: 'hq: z-q builds hq' },
    { issue: 'GEO-3002', reason: 'Design: design slot' },
  ]);
  expect(result.total).toBe(4);
  expect(result.counts['cloud']).toBe(1);
});

test('it sends an issue with no project, and an unnamed project, to flexible', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-4001'), buildReadyIssue('GEO-4002', { project: 'invented project' })], rules);

  expect(result.counts['flexible']).toBe(2);
});

test('it reports 0 for a lane with nothing Ready', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-4001')], rules);

  expect(result.counts).toStrictEqual({ cleanup: 0, process: 0, memory: 0, 'nixie-slice': 0, 'nixie-maintenance': 0, atc: 0, imp: 0, cloud: 0, flexible: 1 });
});

test('it counts the nixie projects in their own lanes, not flexible', () => {
  const rules = validateLaneRules(rulesTable, Object.keys(rulesTable.lanes));

  const result = classifyReady([buildReadyIssue('GEO-4001', { project: 'nixie' }), buildReadyIssue('GEO-4002', { project: 'nixie maintenance' }), buildReadyIssue('GEO-4003', { project: 'nixie maintenance' })], rules);

  expect(result.counts).toMatchObject({ 'nixie-slice': 1, 'nixie-maintenance': 2, flexible: 0 });
});
