import { expect, test } from 'bun:test';
import { buildBriefParts } from './build-brief-parts.ts';

test('it builds the parts of an invented kettle brief, with no issue sections', () => {
  expect(buildBriefParts()).toStrictEqual({ repo: 'kettle', issueID: 'GEO-9001', sections: [], permissions: 'Work in kettle.', stack: '', fixes: 'Fixes', reviewLines: '', notYours: '', impLine: '', goalFile: '' });
});

test('it replaces the fields it is given', () => {
  expect(buildBriefParts({ repo: 'lid', fixes: 'Contributes to' })).toMatchObject({ repo: 'lid', fixes: 'Contributes to', issueID: 'GEO-9001' });
});
