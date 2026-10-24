import { expect, test } from 'bun:test';
import { parseLanesCapArgs } from './parse-lanes-cap-args.ts';

test('it reads no words as show', () => {
  expect(parseLanesCapArgs([], undefined, undefined)).toStrictEqual({ kind: 'show' });
});

test('it reads a count with its flags as a set', () => {
  expect(parseLanesCapArgs(['7'], 'Mon 08:00', ' weekend pacing ')).toStrictEqual({ kind: 'set', cap: 7, until: 'Mon 08:00', reason: 'weekend pacing' });
});

test('it reads zero as a cap', () => {
  expect(parseLanesCapArgs(['0'], undefined, undefined)).toStrictEqual({ kind: 'set', cap: 0, until: null, reason: null });
});

test('it reads off, with a reason', () => {
  expect(parseLanesCapArgs(['off'], undefined, 'the kettle is back')).toStrictEqual({ kind: 'off', reason: 'the kettle is back' });
});

test.each([
  ['a negative count', ['-1']],
  ['a fraction', ['2.5']],
  ['a count past the safe integers', ['9007199254740993']],
  ['a word', ['many']],
  ['two words', ['7', '8']],
])('it refuses %s', (_label, rest) => {
  expect(() => parseLanesCapArgs(rest, undefined, undefined)).toThrow('hq lanes cap');
});

test('it refuses a flag with no cap to set', () => {
  expect(() => parseLanesCapArgs([], 'Mon 08:00', undefined)).toThrow('go with a cap to set');
});

test('it refuses an until on off', () => {
  expect(() => parseLanesCapArgs(['off'], 'Mon 08:00', undefined)).toThrow('takes no --until');
});

test('it refuses an empty reason', () => {
  expect(() => parseLanesCapArgs(['7'], undefined, '  ')).toThrow('--reason must say why');
});
