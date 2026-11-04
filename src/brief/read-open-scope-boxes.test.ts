import { expect, test } from 'bun:test';
import { readOpenScopeBoxes } from './read-open-scope-boxes.ts';

test('it reads each open box that is not the launch area, and says which read like a repo', () => {
  const description = '## Scope\n\n- [ ] kettle: the lid\n- [ ] teapot\n* [ ] `mug`\n- [ ] sieve#12: the mesh\n- [ ] add the retry test\n- [x] spoon\n';

  expect(readOpenScopeBoxes(description, ['kettle'])).toStrictEqual([
    { name: 'teapot', readsAsRepo: true },
    { name: 'mug', readsAsRepo: true },
    { name: 'sieve', readsAsRepo: true },
    { name: 'add', readsAsRepo: false },
  ]);
});

test('it treats the launch area in another case, or with a colon, hash or backticks, as the launch area', () => {
  const description = '## Scope\n\n- [ ] Kettle: the lid\n- [ ] `tools`\n- [ ] tools#12\n';

  expect(readOpenScopeBoxes(description, ['kettle', 'tools'])).toStrictEqual([]);
});

test('it keeps the case the box writes', () => {
  expect(readOpenScopeBoxes('## Scope\n\n- [ ] teapot-Lid: x\n', ['kettle'])).toStrictEqual([{ name: 'teapot-Lid', readsAsRepo: false }]);
});

test('it ignores a box inside a fenced block and a box outside the Scope section', () => {
  const description = '## Scope\n\n```md\n- [ ] teapot\n```\n\n## Acceptance\n\n- [ ] mug\n';

  expect(readOpenScopeBoxes(description, ['kettle'])).toStrictEqual([]);
});

test('it reads open boxes under plus and numbered list markers', () => {
  expect(readOpenScopeBoxes('## Scope\n\n+ [ ] teapot\n1. [ ] mug: the handle\n2) [ ] sieve\n', ['kettle'])).toStrictEqual([
    { name: 'teapot', readsAsRepo: true },
    { name: 'mug', readsAsRepo: true },
    { name: 'sieve', readsAsRepo: true },
  ]);
});
