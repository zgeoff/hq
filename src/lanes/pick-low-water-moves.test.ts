import { expect, test } from 'bun:test';
import { pickLowWaterMoves } from './pick-low-water-moves.ts';

test('#pickLowWaterMoves starts an episode and tells z-triage with the stored list', () => {
  const moves = pickLowWaterMoves({
    eligible: 1,
    free: 2,
    promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' },
    top: { at: '2026-10-14T01:00:00Z', focus: '[]', issues: [{ identifier: 'GEO-9701', title: 'whistle the kettle' }] },
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:10:00Z'),
    since: null,
    alerted: false,
    held: false,
    target: 'z-triage',
  });

  expect(moves).toStrictEqual({
    mark: 3,
    episode: 'started',
    since: '2026-10-14T01:10:00Z',
    message: { subjectID: 'low-water:2026-10-14T01:10:00Z', text: 'Lanes: 1 eligible Ready for 2 free slots (mark 3). Promote now: GEO-9701 whistle the kettle. Run hq lanes promotable for the rest.' },
  });
});

test('#pickLowWaterMoves leaves the list out when it was read with another count', () => {
  const moves = pickLowWaterMoves({
    eligible: 1,
    free: 2,
    promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' },
    top: { at: '2026-10-14T00:50:00Z', focus: '[]', issues: [{ identifier: 'GEO-9701', title: 'whistle the kettle' }] },
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:10:00Z'),
    since: '2026-10-14T01:05:00Z',
    alerted: false,
    held: false,
    target: 'z-triage',
  });

  expect(moves.message).toStrictEqual({ subjectID: 'low-water:2026-10-14T01:05:00Z', text: 'Lanes: 1 eligible Ready for 2 free slots (mark 3). Run hq lanes promotable for the rest.' });
});

test.each([
  { name: 'starts the episode and holds the message under a lanes hold', since: null, alerted: false, held: true, target: 'z-triage', want: { episode: 'started', since: '2026-10-14T01:10:00Z', message: false } },
  { name: 'keeps the episode and sends nothing once z-triage was told', since: '2026-10-14T01:05:00Z', alerted: true, held: false, target: 'z-triage', want: { episode: null, since: '2026-10-14T01:05:00Z', message: false } },
  { name: 'keeps the episode and sends the held message once the hold ends', since: '2026-10-14T01:05:00Z', alerted: false, held: false, target: 'z-triage', want: { episode: null, since: '2026-10-14T01:05:00Z', message: true } },
  { name: 'starts the episode and sends nothing with no triage session', since: null, alerted: false, held: false, target: null, want: { episode: 'started', since: '2026-10-14T01:10:00Z', message: false } },
])('#pickLowWaterMoves $name', (row) => {
  const moves = pickLowWaterMoves({
    eligible: 1,
    free: 2,
    promotable: { at: '2026-10-14T01:00:00Z', count: 2, focus: '[]' },
    top: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:10:00Z'),
    since: row.since,
    alerted: row.alerted,
    held: row.held,
    target: row.target,
  });

  expect({ episode: moves.episode, since: moves.since, message: moves.message !== null }).toStrictEqual(row.want);
});

test.each([
  { name: 'ends an open episode at the mark', eligible: 3, count: 2, since: '2026-10-14T01:05:00Z', want: { episode: 'ended', since: null } },
  { name: 'moves nothing at the mark with no episode open', eligible: 3, count: 2, since: null, want: { episode: null, since: null } },
  { name: 'keeps an open episode when the count is unclear', eligible: 1, count: 0, since: '2026-10-14T01:05:00Z', want: { episode: null, since: '2026-10-14T01:05:00Z' } },
  { name: 'starts no episode when the count is unclear', eligible: 1, count: 0, since: null, want: { episode: null, since: null } },
])('#pickLowWaterMoves $name', (row) => {
  const moves = pickLowWaterMoves({
    eligible: row.eligible,
    free: 2,
    promotable: { at: '2026-10-14T01:00:00Z', count: row.count, focus: '[]' },
    top: null,
    focus: '[]',
    freshMinutes: 30,
    at: new Date('2026-10-14T01:10:00Z'),
    since: row.since,
    alerted: false,
    held: false,
    target: 'z-triage',
  });

  expect({ episode: moves.episode, since: moves.since, message: moves.message }).toStrictEqual({ ...row.want, message: null });
});
