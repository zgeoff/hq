import { expect, test } from 'bun:test';
import { formatCIClause } from './format-ci-clause.ts';

test('it says CI is green when no check was overridden', () => {
  expect(formatCIClause('a1b2c3d', { noCI: false, used: [] })).toBe('CI green at a1b2c3d');
});

test('it names each overridden check with its source', () => {
  expect(formatCIClause('a1b2c3d', { noCI: false, used: [{ check: 'preview', source: 'chat:kettle-4' }, { check: 'lint', source: 'console:KET-9' }] })).toBe('CI green at a1b2c3d except preview, overridden by the owner (chat:kettle-4); lint, overridden by the owner (console:KET-9)');
});

test('it says the repo runs no CI when the head has none', () => {
  expect(formatCIClause('a1b2c3d', { noCI: true, used: [] })).toBe('the repo runs no CI at a1b2c3d');
});
