import { expect, test } from 'bun:test';
import { pickBriefAreas } from './pick-brief-areas.ts';

test('it maps the imp label to the impz repo', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'imp' }, { name: 'auto-mode' }] })).toStrictEqual({
    kind: 'known',
    areas: [
      { label: 'auto-mode', repo: 'auto-mode' },
      { label: 'imp', repo: 'impz' },
    ],
  });
});

test('it reads pepys and osrs as areas beside cloud, and leaves out quality, Type and Size', () => {
  const labels = [{ name: 'pepys' }, { name: 'osrs' }, { name: 'quality' }, { name: 'XL', parent: { name: 'Size' } }, { name: 'Chore', parent: { name: 'Type' } }, { name: 'cloud' }];

  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels })).toStrictEqual({
    kind: 'known',
    areas: [
      { label: 'cloud', repo: 'cloud' },
      { label: 'osrs', repo: 'osrs' },
      { label: 'pepys', repo: 'pepys' },
    ],
  });
});

test('it returns a label that names no repo hq knows as unknown', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'teapot' }] })).toStrictEqual({ kind: 'unknown', label: 'teapot' });
});

test('it returns an area with no repo of its own as unknown', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'frankie' }] })).toStrictEqual({ kind: 'unknown', label: 'frankie' });
});

test('it returns a label named like an Object property, such as constructor, as unknown', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'constructor' }] })).toStrictEqual({ kind: 'unknown', label: 'constructor' });
});
