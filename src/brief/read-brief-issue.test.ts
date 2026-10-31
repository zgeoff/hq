import { expect, test } from 'bun:test';
import { buildStubBriefLinear } from '../../test/build-stub-brief-linear.ts';
import { readBriefIssue } from './read-brief-issue.ts';

test('it reads the identifier, the description and the labels with their groups', async () => {
  const linear = buildStubBriefLinear({ 'GEO-9001': { description: '## Outcome\n\nBoil.', labels: [{ name: 'Bug', parent: 'Type' }, { name: 'tools' }] } });

  const issue = await readBriefIssue(linear.call, 'GEO-9001');

  expect(issue).toStrictEqual({ identifier: 'GEO-9001', description: '## Outcome\n\nBoil.', labels: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'tools', parent: null }] });
  expect(linear.asked).toStrictEqual(['GEO-9001']);
});

test('it reads a null description as empty', async () => {
  const linear = buildStubBriefLinear({ 'GEO-9001': { description: null, labels: [] } });

  const issue = await readBriefIssue(linear.call, 'GEO-9001');

  expect(issue.description).toBe('');
});

test('it rejects an issue Linear does not hold', () => {
  const linear = buildStubBriefLinear({});

  expect(readBriefIssue(linear.call, 'GEO-9099')).rejects.toMatchObject({ code: 'linear_failed', message: 'Linear has no issue GEO-9099' });
});

test('it rejects an answer of an unexpected shape', () => {
  expect(readBriefIssue(() => Promise.resolve({ issue: { identifier: 3 } }), 'GEO-9001')).rejects.toMatchObject({ code: 'linear_failed' });
});
