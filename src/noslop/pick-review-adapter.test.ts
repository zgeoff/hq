import { expect, test } from 'bun:test';
import { pickReviewAdapter } from './pick-review-adapter.ts';

const SETTING = { adapter: 'claude', until: '2026-11-11T13:00:00Z', by: 'kettle-owner' } as const;

test.each([
  ['the flag over the setting', 'codex', SETTING, '2026-11-08T00:00:00Z', { adapter: 'codex', source: 'flag' }],
  ['the setting before its end', undefined, SETTING, '2026-11-08T00:00:00Z', { adapter: 'claude', source: 'setting' }],
  ['noslop\'s default once the setting ends', undefined, SETTING, '2026-11-11T13:00:00Z', { adapter: undefined, source: 'default' }],
  ['noslop\'s default with no setting', undefined, null, '2026-11-08T00:00:00Z', { adapter: undefined, source: 'default' }],
] as const)('it picks %s', (_case, flag, setting, now, picked) => {
  expect(pickReviewAdapter(flag, setting, new Date(now))).toStrictEqual(picked);
});
