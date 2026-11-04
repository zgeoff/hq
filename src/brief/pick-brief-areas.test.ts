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

test('it maps noslop, wringer, wulez, boxxy, llm, dotfiles, nixie-definitions and skills to their own repos', () => {
  const labels = [{ name: 'noslop' }, { name: 'wringer' }, { name: 'dotfiles' }, { name: 'nixie-definitions' }, { name: 'skills' }, { name: 'wulez' }, { name: 'boxxy' }, { name: 'llm' }];

  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels })).toStrictEqual({
    kind: 'known',
    areas: [
      { label: 'boxxy', repo: 'boxxy' },
      { label: 'dotfiles', repo: 'dotfiles' },
      { label: 'llm', repo: 'llm' },
      { label: 'nixie-definitions', repo: 'nixie-definitions' },
      { label: 'noslop', repo: 'noslop' },
      { label: 'skills', repo: 'skills' },
      { label: 'wringer', repo: 'wringer' },
      { label: 'wulez', repo: 'wulez' },
    ],
  });
});

test('it leaves out the with-geoff and parked labels', () => {
  const labels = [{ name: 'with-geoff' }, { name: 'parked' }, { name: 'vers' }];

  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels })).toStrictEqual({ kind: 'known', areas: [{ label: 'vers', repo: 'vers' }] });
});

test('it names the zgeoff repo of the same name for an area label that has no list', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'Teapot' }, { name: 'cloud' }] })).toStrictEqual({
    kind: 'known',
    areas: [
      { label: 'cloud', repo: 'cloud' },
      { label: 'teapot', repo: 'teapot' },
    ],
  });
});

test('it returns an area with no repo of its own as unknown', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'cloud' }, { name: 'frankie' }] })).toStrictEqual({ kind: 'unknown', label: 'frankie' });
});

test('it reads a label named like an Object property, such as constructor, as a repo of that name', () => {
  expect(pickBriefAreas({ identifier: 'GEO-9001', description: '', labels: [{ name: 'constructor' }] })).toStrictEqual({ kind: 'known', areas: [{ label: 'constructor', repo: 'constructor' }] });
});
