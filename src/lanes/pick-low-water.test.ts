import { expect, test } from 'bun:test';
import { pickLowWater } from './pick-low-water.ts';

test.each([
  { name: 'sets the mark to 3 when fewer slots are free', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'low' } },
  { name: 'sets the mark to the free slots when more than 3 are free', eligible: 4, free: 5, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 5, phase: 'low' } },
  { name: 'ends the episode when eligible work reaches the mark', eligible: 3, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'above' } },
  { name: 'is unclear with no promotable count', eligible: 1, free: 2, promotable: null, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'unclear' } },
  { name: 'is unclear with an unknown promotable count', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: null, focus: '[]' }, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'unclear' } },
  { name: 'is unclear with no promotable issue', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 0, focus: '[]' }, focus: '[]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'unclear' } },
  { name: 'is low with a count read exactly 30 minutes ago', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', at: '2026-10-14T01:30:00Z', want: { mark: 3, phase: 'low' } },
  { name: 'is unclear with a count read 31 minutes ago', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '[]', at: '2026-10-14T01:31:00Z', want: { mark: 3, phase: 'unclear' } },
  { name: 'is unclear with a count read under another focus', eligible: 1, free: 2, promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' }, focus: '["bug"]', at: '2026-10-14T01:10:00Z', want: { mark: 3, phase: 'unclear' } },
])('#pickLowWater $name', (row) => {
  expect(pickLowWater({ eligible: row.eligible, free: row.free, promotable: row.promotable, focus: row.focus, freshMinutes: 30, at: new Date(row.at) })).toStrictEqual(row.want);
});
