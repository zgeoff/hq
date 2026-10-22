import { expect, mock, test } from 'bun:test';
import { readOldestContaining } from './read-oldest-containing.ts';

test('it finds the oldest containing release deep in a long list in under 10 compares', async () => {
  const list = Array.from({ length: 100 }, (_, index) => ({ tag: `v1.${99 - index}.0`, at: null }));
  const held = Object.fromEntries(list.slice(0, 81).map((release) => [release.tag, true]));
  const contains = mock((tag: string) => Promise.resolve(held[tag] === true));

  const found = await readOldestContaining(list, contains);

  expect(found).toStrictEqual({ tag: 'v1.19.0', at: null });
  expect(contains.mock.calls.length).toBeLessThan(10);
});

test('it finds the newest release when only the newest holds the merge', async () => {
  const contains = mock((tag: string) => Promise.resolve({ 'v1.2.0': true }[tag] === true));

  const found = await readOldestContaining(
    [
      { tag: 'v1.2.0', at: null },
      { tag: 'v1.1.0', at: null },
      { tag: 'v1.0.0', at: null },
    ],
    contains,
  );

  expect(found).toStrictEqual({ tag: 'v1.2.0', at: null });
});

test('it finds the oldest release when every release holds the merge', async () => {
  const contains = mock(() => Promise.resolve(true));

  const found = await readOldestContaining(
    [
      { tag: 'v1.2.0', at: null },
      { tag: 'v1.1.0', at: null },
      { tag: 'v1.0.0', at: null },
    ],
    contains,
  );

  expect(found).toStrictEqual({ tag: 'v1.0.0', at: null });
});

test('it finds nothing when no release holds the merge', async () => {
  const contains = mock(() => Promise.resolve(false));

  const found = await readOldestContaining(
    [
      { tag: 'v1.2.0', at: null },
      { tag: 'v1.1.0', at: null },
    ],
    contains,
  );

  expect(found).toBeNull();
});

test('it finds nothing in an empty list, with no compare', async () => {
  const contains = mock(() => Promise.resolve(true));

  const found = await readOldestContaining([], contains);

  expect(found).toBeNull();
  expect(contains).not.toHaveBeenCalled();
});

test('it stops with cap when a compare is refused by the cap', async () => {
  const contains = mock(() => Promise.resolve<'cap'>('cap'));

  const found = await readOldestContaining([{ tag: 'v1.0.0', at: null }], contains);

  expect(found).toBe('cap');
});
