import { expect, test } from 'bun:test';
import { collectUnmappedAreas } from './collect-unmapped-areas.ts';

test('it names each area label hq lacks, once and in order, in any case', () => {
  const labels = [
    { name: 'kettle', isGroup: false, parent: null },
    { name: 'Hq', isGroup: false, parent: null },
    { name: 'Teapot', isGroup: false, parent: null },
    { name: 'KETTLE', isGroup: false, parent: null },
  ];

  expect(collectUnmappedAreas(labels)).toStrictEqual(['kettle', 'teapot']);
});

test('it skips groups, the labels in the Type and Size groups, and the labels that name no area', () => {
  const labels = [
    { name: 'Type', isGroup: true, parent: null },
    { name: 'Feature', isGroup: false, parent: { name: 'Type' } },
    { name: 'S', isGroup: false, parent: { name: 'Size' } },
    { name: 'Needs Geoff', isGroup: false, parent: null },
    { name: 'parked', isGroup: false, parent: null },
    { name: 'noslop', isGroup: false, parent: null },
  ];

  expect(collectUnmappedAreas(labels)).toStrictEqual([]);
});
