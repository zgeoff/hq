import { expect, test } from 'bun:test';
import { pickBriefAreas } from './pick-brief-areas.ts';

test('it maps the imp label to the impz repo', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'imp' }, { name: 'auto-mode' }] })).toStrictEqual([
    { label: 'auto-mode', repo: 'auto-mode' },
    { label: 'imp', repo: 'impz' },
  ]);
});

test('it reads pepys and osrs as areas beside cloud, and leaves out quality, Type and Size', () => {
  const labels = [{ name: 'pepys' }, { name: 'osrs' }, { name: 'quality' }, { name: 'XL', parent: { name: 'Size' } }, { name: 'Chore', parent: { name: 'Type' } }, { name: 'cloud' }];

  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels })).toStrictEqual([
    { label: 'cloud', repo: 'cloud' },
    { label: 'osrs', repo: 'osrs' },
    { label: 'pepys', repo: 'pepys' },
  ]);
});

test('it refuses a label that names no repo hq knows, by name', () => {
  expect(() => pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'teapot' }] })).toThrow(
    'GEO-9001 has the label teapot, which names no repo hq knows: add it to AREA_REPOS in src/brief/area-repos.ts, or take it off the issue',
  );
});

test('it refuses an area that has no repo of its own', () => {
  expect(() => pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'frankie' }] })).toThrow('GEO-9001 has the label frankie, which names no repo hq knows');
});

test('it refuses a label named like an Object property, such as constructor', () => {
  expect(() => pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'constructor' }] })).toThrow('GEO-9001 has the label constructor, which names no repo hq knows');
});
