import { expect, test } from 'bun:test';
import { buildAdapterSetting } from './build-adapter-setting.ts';

test.each([
  { name: 'a UTC time', until: '2026-11-11T13:00:00Z' },
  { name: 'a time with an offset', until: '2026-11-11T14:00:00+01:00' },
])('it builds a claude setting that ends at $name', (row) => {
  expect(buildAdapterSetting(['claude'], row.until, 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toStrictEqual({ adapter: 'claude', until: '2026-11-11T13:00:00.000Z', by: 'kettle-owner' });
});

test('it clears the setting for codex', () => {
  expect(buildAdapterSetting(['codex'], undefined, 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toBeNull();
});

test.each([
  { name: 'claude with no --until', rest: ['claude'], until: undefined, message: '--until must be a time with a zone in the next 14 days' },
  { name: 'claude with an --until that has no zone', rest: ['claude'], until: '2026-11-11T13:00:00', message: '--until must be a time with a zone in the next 14 days' },
  { name: 'claude with an --until in the past', rest: ['claude'], until: '2026-11-01T00:00:00Z', message: '--until must be a time with a zone in the next 14 days' },
  { name: 'claude with an --until past 14 days', rest: ['claude'], until: '2026-12-01T00:00:00Z', message: '--until must be a time with a zone in the next 14 days' },
  { name: 'codex with an --until', rest: ['codex'], until: '2026-11-11T13:00:00Z', message: 'codex is noslop\'s default adapter: give no --until' },
  { name: 'an unknown adapter', rest: ['gemini'], until: undefined, message: 'hq noslop adapter claude --until ISO, or hq noslop adapter codex' },
  { name: 'no adapter', rest: [], until: undefined, message: 'hq noslop adapter claude --until ISO, or hq noslop adapter codex' },
  { name: 'two words', rest: ['claude', 'opus'], until: '2026-11-11T13:00:00Z', message: 'hq noslop adapter claude --until ISO, or hq noslop adapter codex' },
])('it refuses $name', (row) => {
  expect(() => buildAdapterSetting(row.rest, row.until, 'kettle-owner', new Date('2026-11-07T10:00:00Z'))).toThrow(expect.objectContaining({ code: 'bad_args', message: expect.stringContaining(row.message) }));
});
