import { expect, test } from 'bun:test';
import { pickReviewAdapter } from './pick-review-adapter.ts';

test.each([
  { name: 'the flag over the setting', flag: 'codex', setting: { adapter: 'claude', until: '2026-11-11T13:00:00Z', by: 'kettle-owner' }, now: '2026-11-08T00:00:00Z', picked: { adapter: 'codex', source: 'flag' } },
  { name: 'the setting before its end', flag: undefined, setting: { adapter: 'claude', until: '2026-11-11T13:00:00Z', by: 'kettle-owner' }, now: '2026-11-08T00:00:00Z', picked: { adapter: 'claude', source: 'setting' } },
  { name: 'noslop\'s default once the setting ends', flag: undefined, setting: { adapter: 'claude', until: '2026-11-11T13:00:00Z', by: 'kettle-owner' }, now: '2026-11-11T13:00:00Z', picked: { adapter: undefined, source: 'default' } },
  { name: 'noslop\'s default with no setting', flag: undefined, setting: null, now: '2026-11-08T00:00:00Z', picked: { adapter: undefined, source: 'default' } },
] as const)('it picks $name', (row) => {
  expect(pickReviewAdapter(row.flag, row.setting, new Date(row.now))).toStrictEqual(row.picked);
});
