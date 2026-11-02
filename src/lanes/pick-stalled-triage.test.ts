import { expect, test } from 'bun:test';
import { pickStalledTriage } from './pick-stalled-triage.ts';

test.each([
  { name: 'sends nothing at 29 minutes', cause: 'triage', slots: 3, at: '2026-10-14T01:29:00Z', held: false, alerted: false, toldAt: null, want: null },
  { name: 'tells the owner at 30 minutes', cause: 'triage', slots: 3, at: '2026-10-14T01:30:00Z', held: false, alerted: false, toldAt: null, want: 'Lanes: 3 slots empty for 30 min with Backlog issues to promote (triage).' },
  { name: 'names when the low-water message reached z-triage', cause: 'triage', slots: 3, at: '2026-10-14T01:30:00Z', held: false, alerted: false, toldAt: '2026-10-14T01:05:00Z', want: 'Lanes: 3 slots empty for 30 min with Backlog issues to promote (triage). z-triage got the low-water message at 12:05.' },
  { name: 'sends nothing once the owner was told in this episode', cause: 'triage', slots: 3, at: '2026-10-14T01:40:00Z', held: false, alerted: true, toldAt: null, want: null },
  { name: 'sends nothing under a lanes hold', cause: 'triage', slots: 3, at: '2026-10-14T01:40:00Z', held: true, alerted: false, toldAt: null, want: null },
  { name: 'sends nothing for another cause', cause: 'supply', slots: 3, at: '2026-10-14T01:40:00Z', held: false, alerted: false, toldAt: null, want: null },
  { name: 'sends nothing with no free slot', cause: 'triage', slots: 0, at: '2026-10-14T01:40:00Z', held: false, alerted: false, toldAt: null, want: null },
] as const)('#pickStalledTriage $name', (row) => {
  const picked = pickStalledTriage({
    slotCause: { cause: row.cause, since: '2026-10-14T01:00:00Z', slots: row.slots, readyAgeMinutes: null, reason: null, waitingMinutes: null, backlogError: null },
    held: row.held,
    at: new Date(row.at),
    alerted: row.alerted,
    toldAt: row.toldAt,
  });

  expect(picked?.text ?? null).toBe(row.want);
});
