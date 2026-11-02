import { expect, test } from 'bun:test';
import { pickPromotableFreshness } from './pick-promotable-freshness.ts';

test.each([
  { name: 'a count read under another focus', focus: 'area:kettles', at: '2026-10-14T01:00:00Z', freshness: 'focus_changed' },
  { name: 'a count read 30 minutes ago', focus: 'area:teapots', at: '2026-10-14T01:00:00Z', freshness: 'fresh' },
  { name: 'a count read 30 minutes and 1 second ago', focus: 'area:teapots', at: '2026-10-14T00:59:59Z', freshness: 'stale' },
  { name: 'a count read just now', focus: 'area:teapots', at: '2026-10-14T01:30:00Z', freshness: 'fresh' },
])('#pickPromotableFreshness reads $name as $freshness', (row) => {
  expect(pickPromotableFreshness({ promotable: { at: row.at, focus: row.focus }, focus: 'area:teapots', freshMinutes: 30, at: new Date('2026-10-14T01:30:00Z') })).toBe(row.freshness);
});
