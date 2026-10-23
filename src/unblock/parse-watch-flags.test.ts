import { expect, test } from 'bun:test';
import { parseWatchFlags } from './parse-watch-flags.ts';

test('it reads a watch kind and a deadline, the deadline in UTC', () => {
  expect(parseWatchFlags('watch', '2026-11-02T20:00:00+11:00')).toStrictEqual({ kind: 'watch', deadline: '2026-11-02T09:00:00Z' });
});

test('it leaves out both when neither is given, so a refresh keeps the stored ones', () => {
  expect(parseWatchFlags(undefined, undefined)).toStrictEqual({});
});

test('it refuses a kind that is not owner or watch', () => {
  expect(() => parseWatchFlags('teapot', undefined)).toThrow(expect.objectContaining({ code: 'bad_args', message: '--kind must be owner or watch, not "teapot"' }));
});

test.each(['tomorrow', '2026-11-02', '2026-13-02T09:00:00Z'])('it refuses the deadline %s', (deadline) => {
  expect(() => parseWatchFlags(undefined, deadline)).toThrow(expect.objectContaining({ code: 'bad_args', message: `--deadline takes an ISO time, such as 2026-11-02T09:00:00Z, not "${deadline}"` }));
});
