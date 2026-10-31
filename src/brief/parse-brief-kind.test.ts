import { expect, test } from 'bun:test';
import { parseBriefKind } from './parse-brief-kind.ts';

test('it takes delivery when no --kind is given', () => {
  expect(parseBriefKind({})).toBe('delivery');
});

test.each(['delivery', 'design', 'pr-walk'] as const)('it takes --kind %s', (kind) => {
  expect(parseBriefKind({ kind })).toBe(kind);
});

test('it rejects an unknown --kind as a usage error', () => {
  expect(() => parseBriefKind({ kind: 'kettle' })).toThrow(expect.objectContaining({ code: 'bad_args', message: '--kind must be delivery, design or pr-walk: kettle' }));
});
