import { expect, test } from 'bun:test';
import { pickFinalClaims } from './pick-final-claims.ts';

test('it claims the PR of a marker that no run owns yet', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: null }, phrase: null, owned: [] })).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test("it claims the PR of a marker that the note's run owns", () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: 'GEO-9731' }, phrase: null, owned: [] })).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test('it claims nothing for a marker whose PR another run owns', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: 'GEO-9732' }, phrase: null, owned: [] })).toStrictEqual([]);
});

test('it claims nothing for a marker whose PR does not parse', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: null, sha: '44238662', owner: null }, phrase: null, owned: [] })).toStrictEqual([]);
});

test('it claims only the named PRs that the run owns for a phrase', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: ['kettle#714', 'toaster#88'] },
      owned: [{ ref: 'kettle#714', state: 'merged' }],
    }),
  ).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test("it claims every open PR of the run for a phrase that names none", () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: [] },
      owned: [
        { ref: 'kettle#714', state: 'open' },
        { ref: 'kettle#715', state: 'merged' },
        { ref: 'kettle#716', state: 'open' },
      ],
    }),
  ).toStrictEqual([
    { ref: 'kettle#714', sha: '44238662' },
    { ref: 'kettle#716', sha: '44238662' },
  ]);
});

test('it claims nothing for a note with no FINAL', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: null, phrase: null, owned: [{ ref: 'kettle#714', state: 'open' }] })).toStrictEqual([]);
});
