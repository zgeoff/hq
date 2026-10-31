import { expect, test } from 'bun:test';
import { isLastArea } from './is-last-area.ts';

test('it is the last area when every other area has a ticked box', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot: the lid\n* [X] `mug`\n- [ ] kettle\n', [{ label: 'teapot', repo: 'teapot' }, { label: 'mug', repo: 'mug' }])).toBe(true);
});

test('it is not the last area when another area box is open', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot\n- [ ] mug\n', [{ label: 'teapot', repo: 'teapot' }, { label: 'mug', repo: 'mug' }])).toBe(false);
});

test('it is not the last area when another area has no box', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot\n', [{ label: 'teapot', repo: 'teapot' }, { label: 'mug', repo: 'mug' }])).toBe(false);
});

test('it matches an area as a whole word, so teapot-tools does not tick teapot', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot-tools\n', [{ label: 'teapot', repo: 'teapot' }])).toBe(false);
});

test('it is the last area for an issue with one area, which has no other', () => {
  expect(isLastArea('', [])).toBe(true);
});

test('it reads ticked boxes only from the Scope section, so an Acceptance box does not count', () => {
  expect(isLastArea('## Scope\n\n- [ ] teapot\n\n## Acceptance\n\n- [x] teapot is descaled\n', [{ label: 'teapot', repo: 'teapot' }])).toBe(false);
});

test('it does not count a mention of an area inside another area box', () => {
  expect(isLastArea('## Scope\n\n- [x] cloud: drop the imp dependency\n- [ ] imp: update the worker\n', [{ label: 'imp', repo: 'imp' }])).toBe(false);
});

test('it counts an area that opens a ticked box followed by a PR number', () => {
  expect(isLastArea('## Scope\n\n- [x] cloud#745\n', [{ label: 'cloud', repo: 'cloud' }])).toBe(true);
});

test('it skips a ticked box inside a code fence in Scope', () => {
  expect(isLastArea('## Scope\n\n```md\n- [x] teapot\n```\n- [ ] teapot\n', [{ label: 'teapot', repo: 'teapot' }])).toBe(false);
});

test('it counts a box that names the area by its repo', () => {
  expect(isLastArea('## Scope\n\n- [x] impz#754\n', [{ label: 'imp', repo: 'impz' }])).toBe(true);
});
