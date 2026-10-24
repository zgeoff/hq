import { expect, test } from 'bun:test';
import { parseFocusTerms } from '../focus/parse-focus-terms.ts';
import { formatSlotNudge } from './format-slot-nudge.ts';
import { formatSlotPlan } from './format-slot-plan.ts';
import type { SlotPlan } from './read-slot-plan.ts';

test('hq lanes prints the local sessions against their cap, the focus and the picks', () => {
  // A pool of 4 imp and 3 local slots, 2 of them running locally, under focus `bug` with a vers
  // reserve lent and a Design issue waiting.
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 3, impRunning: 1, localRunning: 2, impFree: 2, localFree: 1, free: 3, held: 'impd at line', localHeld: null, localSource: null },
    focus: { terms: parseFocusTerms('bug'), reserves: [{ area: 'vers', slots: 1 }], setAt: '2026-10-15T20:00:00Z', setBy: 'kettle-owner' },
    plan: {
      picks: [
        { issue: 'GEO-9801', term: 0, reserve: null },
        { issue: 'GEO-9802', term: null, reserve: null },
      ],
      lent: [{ area: 'vers', slots: 1 }],
    },
    eligible: 2,
    design: 'GEO-9803',
    skipped: [],
  };

  expect(formatSlotPlan(slotPlan)).toStrictEqual([
    'slots (running/size, free now): imp 1/4, 2 free (3 free by count, held: impd at line); local 2/3, 1 free',
    'local: 2 of 3 delivery sessions on this host',
    'focus: bug; reserve vers=1',
    'next: GEO-9801, GEO-9802 (2 eligible)',
    '  lent: 1 slot(s) reserved for vers, nothing eligible',
    'design slot, when it is free: GEO-9803',
  ]);
});

test('the nudge names the free slots and each pick with its focus term', () => {
  // A pool of 4 imp and 3 local slots, 2 of them running locally, under focus `bug` with a vers
  // reserve lent and a Design issue waiting.
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 3, impRunning: 1, localRunning: 2, impFree: 2, localFree: 1, free: 3, held: 'impd at line', localHeld: null, localSource: null },
    focus: { terms: parseFocusTerms('bug'), reserves: [{ area: 'vers', slots: 1 }], setAt: '2026-10-15T20:00:00Z', setBy: 'kettle-owner' },
    plan: {
      picks: [
        { issue: 'GEO-9801', term: 0, reserve: null },
        { issue: 'GEO-9802', term: null, reserve: null },
      ],
      lent: [{ area: 'vers', slots: 1 }],
    },
    eligible: 2,
    design: 'GEO-9803',
    skipped: [],
  };

  expect(formatSlotNudge(slotPlan, 12)).toBe(
    '3 slots free for 12 min (imp 2, local 1). Take, in this order: GEO-9801 (focus 1: bug), GEO-9802. Reserved for vers with nothing eligible, lent: 1. For the design slot, when it is free: GEO-9803. (hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)',
  );
});

test('hq lanes names the live sessions here when they set the local count', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 6, impRunning: 1, localRunning: 7, impFree: 3, localFree: 0, free: 3, held: null, localHeld: null, localSource: '7 live sessions here' },
    focus: null,
    plan: null,
    eligible: null,
    design: null,
    skipped: [],
  };

  expect(formatSlotPlan(slotPlan)[0]).toBe('slots (running/size, free now): imp 1/4, 3 free; local 7/6, 0 free (7 live sessions here)');
});
