import { expect, test } from 'bun:test';
import { pickFinalClaims } from './pick-final-claims.ts';

test('it claims the PR of a marker that no run owns yet', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: null }, phrase: null })).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test("it claims the PR of a marker that the note's run owns", () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: 'GEO-9731' }, phrase: null })).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test('it claims nothing for a marker whose PR another run owns', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: 'kettle#714', sha: '44238662', owner: 'GEO-9732' }, phrase: null })).toStrictEqual([]);
});

test('it claims nothing for a marker whose PR does not parse', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: { ref: null, sha: '44238662', owner: null }, phrase: null })).toStrictEqual([]);
});

test('it claims the one open PR of the run that a phrase names', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: ['kettle#714'], refs: { all: new Set(['kettle#714', 'kettle#715']), open: new Set(['kettle#714', 'kettle#715']), deliveryOpen: ['kettle#714', 'kettle#715'] } },
    }),
  ).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test('it claims nothing for a phrase that names a PR outside the run', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: ['kettle#714', 'toaster#88'], refs: { all: new Set(['kettle#714']), open: new Set(['kettle#714']), deliveryOpen: ['kettle#714'] } },
    }),
  ).toStrictEqual([]);
});

test('it claims the only open PR of the run for a phrase that names none', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: [], refs: { all: new Set(['kettle#714', 'kettle#715']), open: new Set(['kettle#714']), deliveryOpen: ['kettle#714'] } },
    }),
  ).toStrictEqual([{ ref: 'kettle#714', sha: '44238662' }]);
});

test('it claims nothing for a phrase that names no PR when two are open', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: [], refs: { all: new Set(['kettle#714', 'kettle#716']), open: new Set(['kettle#714', 'kettle#716']), deliveryOpen: ['kettle#714', 'kettle#716'] } },
    }),
  ).toStrictEqual([]);
});

test('it claims nothing for a phrase that names no PR when only a design pass PR is open', () => {
  expect(
    pickFinalClaims({
      issue: 'GEO-9731',
      mark: null,
      phrase: { sha: '44238662', mentioned: [], refs: { all: new Set(['kettle#714']), open: new Set(['kettle#714']), deliveryOpen: [] } },
    }),
  ).toStrictEqual([]);
});

test('it claims nothing for a note with no FINAL', () => {
  expect(pickFinalClaims({ issue: 'GEO-9731', mark: null, phrase: null })).toStrictEqual([]);
});
