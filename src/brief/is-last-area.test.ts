import { expect, test } from 'bun:test';
import { isLastArea } from './is-last-area.ts';

test('it is the last area when every other area has a ticked box', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot: the lid\n* [X] `mug`\n- [ ] kettle\n', ['teapot', 'mug'])).toBe(true);
});

test('it is not the last area when another area box is open or missing', () => {
  expect(isLastArea('## Scope\n\n- [x] teapot\n- [ ] mug\n', ['teapot', 'mug'])).toBe(false);
  expect(isLastArea('## Scope\n\n- [x] teapot\n', ['teapot', 'mug'])).toBe(false);
});

test('it matches an area as a whole word, so teapot-tools does not tick teapot', () => {
  expect(isLastArea('- [x] teapot-tools\n', ['teapot'])).toBe(false);
});

test('it is the last area for an issue with one area, which has no other', () => {
  expect(isLastArea('', [])).toBe(true);
});
