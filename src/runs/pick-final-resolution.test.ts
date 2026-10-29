import { expect, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { pickFinalResolution } from './pick-final-resolution.ts';

function setupTest() {
  const first = `1111111${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const twin = `44238662${buildMockSha(3).slice(8)}`;
  return { first, head, twin };
}

test('it picks the one commit of the PR whose sha starts with the given sha', () => {
  const ctx = setupTest();
  expect(pickFinalResolution('44238662', { kind: 'listed', shas: [ctx.first, ctx.head] }, null)).toStrictEqual({ kind: 'full', sha: ctx.head });
});

test('it matches a given sha in upper case', () => {
  const ctx = setupTest();
  expect(pickFinalResolution('1111111', { kind: 'listed', shas: [ctx.first.toUpperCase(), ctx.head] }, null)).toStrictEqual({ kind: 'full', sha: ctx.first });
});

test('it refuses an ambiguous sha and lists every match', () => {
  const ctx = setupTest();
  expect(pickFinalResolution('44238662', { kind: 'listed', shas: [ctx.first, ctx.head, ctx.twin] }, null)).toStrictEqual({ kind: 'refused', reason: 'ambiguous', shas: [ctx.head, ctx.twin] });
});

test('it takes the full sha of a lookup when no commit of the PR matches', () => {
  const ctx = setupTest();
  const lookup = { kind: 'found' as const, sha: buildMockSha(9) };
  expect(pickFinalResolution('0000000', { kind: 'listed', shas: [ctx.first, ctx.head] }, lookup)).toStrictEqual({ kind: 'full', sha: lookup.sha });
});

test('it refuses a sha that neither the PR nor the lookup knows, and names the PR head', () => {
  const ctx = setupTest();
  expect(pickFinalResolution('4423866e', { kind: 'listed', shas: [ctx.first, ctx.head] }, { kind: 'missing' })).toStrictEqual({ kind: 'refused', reason: 'no-match', head: ctx.head });
});

test('it names no head when the list is as long as GitHub lists', () => {
  const shas = Array.from({ length: 250 }, (_, index) => buildMockSha(index));
  expect(pickFinalResolution('ffffffff', { kind: 'listed', shas }, { kind: 'missing' })).toStrictEqual({ kind: 'refused', reason: 'no-match', head: null });
});

test('it leaves a sha unresolved when the commit list read failed', () => {
  expect(pickFinalResolution('44238662', { kind: 'fault', reason: 'HTTP 502' }, null)).toStrictEqual({ kind: 'unresolved', reason: 'HTTP 502' });
});

test('it leaves a sha unresolved when the lookup failed', () => {
  const ctx = setupTest();
  expect(pickFinalResolution('9999999', { kind: 'listed', shas: [ctx.first] }, { kind: 'fault', reason: 'timed out' })).toStrictEqual({ kind: 'unresolved', reason: 'timed out' });
});
