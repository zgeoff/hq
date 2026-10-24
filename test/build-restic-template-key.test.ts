import { expect, test } from 'bun:test';
import { buildResticTemplateKey } from './build-restic-template-key.ts';

test('it gives the same key for the same restic version and build inputs', () => {
  expect(buildResticTemplateKey('restic 0.17.3', ['builder', 'rewriter'])).toBe(buildResticTemplateKey('restic 0.17.3', ['builder', 'rewriter']));
});

test('it gives a new key when restic is upgraded', () => {
  expect(buildResticTemplateKey('restic 0.18.0', ['builder', 'rewriter'])).not.toBe(buildResticTemplateKey('restic 0.17.3', ['builder', 'rewriter']));
});

test('it gives a new key when any build input changes', () => {
  const key = buildResticTemplateKey('restic 0.17.3', ['builder', 'rewriter']);

  expect([buildResticTemplateKey('restic 0.17.3', ['builder v2', 'rewriter']), buildResticTemplateKey('restic 0.17.3', ['builder', 'rewriter v2'])]).not.toContain(key);
});

test('it keeps inputs apart, so moving text between two inputs changes the key', () => {
  expect(buildResticTemplateKey('restic 0.17.3', ['ab', 'c'])).not.toBe(buildResticTemplateKey('restic 0.17.3', ['a', 'bc']));
});
