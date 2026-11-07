import { expect, test } from 'bun:test';
import { buildAdapterSetting } from './build-adapter-setting.ts';

test('it builds a claude setting that ends at --until', () => {
  expect(buildAdapterSetting(['claude'], '2026-11-11T13:00:00Z', 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toStrictEqual({ adapter: 'claude', until: '2026-11-11T13:00:00.000Z', by: 'kettle-owner' });
});

test('it clears the setting for codex', () => {
  expect(buildAdapterSetting(['codex'], undefined, 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toBeNull();
});

test.each([
  ['claude with no --until', ['claude'], undefined, '--until must be a time in the next 14 days'],
  ['claude with an --until in the past', ['claude'], '2026-11-01T00:00:00Z', '--until must be a time in the next 14 days'],
  ['claude with an --until past 14 days', ['claude'], '2026-12-01T00:00:00Z', '--until must be a time in the next 14 days'],
  ['codex with an --until', ['codex'], '2026-11-11T13:00:00Z', 'codex is noslop\'s default adapter: give no --until'],
  ['an unknown adapter', ['gemini'], undefined, '--adapter must be codex or claude, not "gemini"'],
  ['two words', ['claude', 'opus'], '2026-11-11T13:00:00Z', 'hq noslop adapter claude --until ISO, or hq noslop adapter codex'],
] as const)('it refuses %s', (_case, rest, until, message) => {
  expect(() => buildAdapterSetting(rest, until, 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toThrow(expect.objectContaining({ code: 'bad_args', message: expect.stringContaining(message) }));
});
