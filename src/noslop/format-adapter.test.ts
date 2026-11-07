import { expect, test } from 'bun:test';
import { formatAdapter } from './format-adapter.ts';

test.each([
  { name: 'claude from the flag', picked: { adapter: 'claude', source: 'flag', until: null }, text: 'claude on Opus (--adapter)' },
  { name: 'codex from the flag', picked: { adapter: 'codex', source: 'flag', until: null }, text: 'codex (--adapter)' },
  { name: 'claude from the stored setting', picked: { adapter: 'claude', source: 'setting', until: '2026-11-12T00:00:00.000Z' }, text: 'claude on Opus (stored setting until 2026-11-12T00:00:00.000Z; hq noslop adapter codex ends it)' },
  { name: 'noslop\'s default', picked: { adapter: undefined, source: 'default', until: null }, text: 'noslop\'s default' },
] as const)('it names $name', (row) => {
  expect(formatAdapter(row.picked)).toBe(row.text);
});
