import { expect, test } from 'bun:test';
import { buildPermissions } from './build-permissions.ts';

test('it lists Code delivery first, the other actions in order, with the repo in place of <repo>', () => {
  const result = buildPermissions(['Post', 'Code delivery'], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Deploy', phrase: 'Deploy to <environment> when <when>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle');

  expect(result).toStrictEqual({ lines: ['Work in kettle and open a PR.', 'Post to the kettle forum.'], unfilled: [] });
});

test('it lists Code delivery alone when the issue lists no action', () => {
  expect(buildPermissions([], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Deploy', phrase: 'Deploy to <environment> when <when>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle').lines).toStrictEqual(['Work in kettle and open a PR.']);
});

test('it lists a phrase that still holds a slot in unfilled, by its action', () => {
  const result = buildPermissions(['deploy'], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Deploy', phrase: 'Deploy to <environment> when <when>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle');

  expect(result).toStrictEqual({ lines: ['Work in kettle and open a PR.', 'Deploy to <environment> when <when>.'], unfilled: ['permissions:Deploy'] });
});

test('it lists an action with no row in unfilled, marked as having no wording, and prints no line for it', () => {
  const result = buildPermissions(['Linear edits'], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Deploy', phrase: 'Deploy to <environment> when <when>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle');

  expect(result).toStrictEqual({ lines: ['Work in kettle and open a PR.'], unfilled: ['permissions:Linear edits (no wording)'] });
});

test('it lists an action given twice once', () => {
  expect(buildPermissions(['Post', 'Post'], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Deploy', phrase: 'Deploy to <environment> when <when>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle').lines).toHaveLength(2);
});

test('it names an action by the row that opens its line as whole words, the longest such row first', () => {
  const result = buildPermissions(['Code delivery in zgeoff/kettle (the spout folder)', 'Paid API for the steam model'], [
    { action: 'Code delivery', phrase: 'Work in <repo> and open a PR.' },
    { action: 'Paid', phrase: 'Pay for the kettle.' },
    { action: 'Paid API', phrase: 'Call the steam model.' },
  ], 'kettle');

  expect(result).toStrictEqual({ lines: ['Work in kettle and open a PR.', 'Call the steam model.'], unfilled: [] });
});

test('it does not take a row whose name only starts a longer word of the line', () => {
  const result = buildPermissions(['Postage for the kettle'], [
    { action: 'Code delivery', phrase: 'Work in <repo>.' },
    { action: 'Post', phrase: 'Post to the kettle forum.' },
  ], 'kettle');

  expect(result).toStrictEqual({ lines: ['Work in kettle.'], unfilled: ['permissions:Postage for the kettle (no wording)'] });
});
