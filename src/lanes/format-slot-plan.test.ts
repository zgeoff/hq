import { expect, test } from 'bun:test';
import { parseFocusTerms } from '../focus/parse-focus-terms.ts';
import { formatSlotNudge } from './format-slot-nudge.ts';
import { formatSlotPlan } from './format-slot-plan.ts';
import type { SlotPlan } from './read-slot-plan.ts';

test('hq lanes prints the local sessions against their cap, the focus and the picks', () => {
  // A pool of 4 imp and 3 local slots, 2 of them running locally, under focus `bug` with a vers
  // reserve lent and a Design issue waiting.
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 3, impRunning: 1, localRunning: 2, impFree: 2, localFree: 1, free: 3, capHeld: false, held: 'impd at line', localHeld: null, localSource: null },
    focus: { terms: parseFocusTerms('bug'), reserves: [{ area: 'vers', slots: 1 }], setAt: '2026-10-15T20:00:00Z', setBy: 'kettle-owner' },
    plan: {
      picks: [
        { issue: 'GEO-9801', term: 0, reserve: null },
        { issue: 'GEO-9802', term: null, reserve: null },
      ],
      lent: [{ area: 'vers', slots: 1 }],
    },
    readyReadAt: '2026-10-15T20:00:00Z',
    eligible: 2,
    design: 'GEO-9803',
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:07:00Z'))).toStrictEqual([
    'slots (running/size, free now): imp 1/4, 2 free (3 free by count, held: impd at line); local 2/3, 1 free',
    'local: 2 of 3 delivery sessions on this host',
    'focus: bug; reserve vers=1',
    'next: GEO-9801, GEO-9802 (2 eligible; Ready read 7 min ago)',
    '  lent: 1 slot(s) reserved for vers, nothing eligible',
    'design slot, when it is free: GEO-9803',
  ]);
});

test('the nudge names the free slots and each pick with its focus term', () => {
  // A pool of 4 imp and 3 local slots, 2 of them running locally, under focus `bug` with a vers
  // reserve lent and a Design issue waiting.
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 3, impRunning: 1, localRunning: 2, impFree: 2, localFree: 1, free: 3, capHeld: false, held: 'impd at line', localHeld: null, localSource: null },
    focus: { terms: parseFocusTerms('bug'), reserves: [{ area: 'vers', slots: 1 }], setAt: '2026-10-15T20:00:00Z', setBy: 'kettle-owner' },
    plan: {
      picks: [
        { issue: 'GEO-9801', term: 0, reserve: null },
        { issue: 'GEO-9802', term: null, reserve: null },
      ],
      lent: [{ area: 'vers', slots: 1 }],
    },
    readyReadAt: '2026-10-15T20:00:00Z',
    eligible: 2,
    design: 'GEO-9803',
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotNudge(slotPlan, 12)).toBe(
    '3 slots free for 12 min (imp 2, local 1). Take, in this order: GEO-9801 (focus 1: bug), GEO-9802. Reserved for vers with nothing eligible, lent: 1. For the design slot, when it is free: GEO-9803. (hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)',
  );
});

test('hq lanes names the live sessions here when they set the local count', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 4, localSize: 6, impRunning: 1, localRunning: 7, impFree: 3, localFree: 0, free: 3, capHeld: false, held: null, localHeld: null, localSource: '7 live sessions here' },
    focus: null,
    plan: null,
    readyReadAt: null,
    eligible: null,
    design: null,
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:07:00Z'))[0]).toBe('slots (running/size, free now): imp 1/4, 3 free; local 7/6, 0 free (7 live sessions here)');
});

test('hq lanes prints the cap line with its until, reason and working count', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 13, impRunning: 0, localRunning: 6, impFree: 0, localFree: 1, free: 1, capHeld: true, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: null,
    readyReadAt: null,
    eligible: null,
    design: null,
    skipped: [],
    cap: { cap: 7, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', working: 6, limitedBy: 'cap', workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:07:00Z'))).toContain('cap: 7 until Mon 08:00 Sydney (weekend pacing), 6 working');
});

test('hq lanes prints a cap with no until or reason, and says when the working count comes from runs', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 13, impRunning: 0, localRunning: 6, impFree: 0, localFree: 1, free: 1, capHeld: true, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: null,
    readyReadAt: null,
    eligible: null,
    design: null,
    skipped: [],
    cap: { cap: 7, until: null, reason: null, by: 'z-stu', working: 6, limitedBy: 'cap', workingFrom: 'runs' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:07:00Z'))).toContain('cap: 7, 6 working (counted by run: the atc reading is stale)');
});

test('the nudge says the cap holds the rest of the pool free slots', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 13, impRunning: 0, localRunning: 6, impFree: 0, localFree: 7, free: 1, capHeld: true, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: { picks: [{ issue: 'GEO-9801', term: null, reserve: null }], lent: [] },
    readyReadAt: '2026-10-15T20:00:00Z',
    eligible: 1,
    design: null,
    skipped: [],
    cap: { cap: 7, until: null, reason: null, by: 'z-stu', working: 6, limitedBy: 'cap', workingFrom: 'sessions' },
  };

  expect(formatSlotNudge(slotPlan, 12)).toInclude('1 slot free for 12 min (imp 0, local 7; the cap of 7 holds the rest)');
});

test('it says the Ready read was just now when it is under a minute old', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 2, impRunning: 0, localRunning: 0, impFree: 0, localFree: 2, free: 2, capHeld: false, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: { picks: [{ issue: 'GEO-9811', term: null, reserve: null }], lent: [] },
    readyReadAt: '2026-10-15T20:00:00Z',
    eligible: 1,
    design: null,
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:00:59Z'))).toContain('next: GEO-9811 (1 eligible; Ready read just now)');
});

test('it gives the Ready read age in whole minutes when nothing is eligible', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 2, impRunning: 0, localRunning: 0, impFree: 0, localFree: 2, free: 2, capHeld: false, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: { picks: [], lent: [] },
    readyReadAt: '2026-10-15T20:00:00Z',
    eligible: 0,
    design: null,
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:12:40Z'))).toContain('next: nothing (0 eligible; Ready read 12 min ago)');
});

test('it says Ready is unknown when there is no fresh Ready read', () => {
  const slotPlan: SlotPlan = {
    pool: { impSize: 0, localSize: 2, impRunning: 0, localRunning: 0, impFree: 0, localFree: 2, free: 2, capHeld: false, held: null, localHeld: null, localSource: null },
    focus: null,
    plan: null,
    readyReadAt: null,
    eligible: null,
    design: null,
    skipped: [],
    cap: { cap: null, until: null, reason: null, by: null, working: 0, limitedBy: null, workingFrom: 'sessions' },
  };

  expect(formatSlotPlan(slotPlan, new Date('2026-10-15T20:12:40Z'))).toContain('next: Ready unknown (no fresh read from Linear)');
});
