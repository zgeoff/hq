import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { readMainGrants } from './read-main-grants.ts';

function setupTest() {
  return createTreeFixture();
}

test('it reads a grants file with source, until and log still reads as its id and label', () => {
  const ctx = setupTest();
  const tree = ctx.createPrivate({
    'grants/z-lantern.yaml': [
      '- id: oil',
      '  label: "Oil"',
      '  outcome: allow',
      '  note: "Refill a lamp from the shed barrel."',
      '  source: "The keeper, 2026-03-02"',
      '  until: 2099-01-01',
      '  log: true',
      '',
    ].join('\n'),
  });
  tree.git('fetch', '-q', 'origin');

  expect(readMainGrants(tree.directory)).toStrictEqual([{ session: 'z-lantern', id: 'oil', label: 'Oil', name: 'z-lantern-oil' }]);
});
