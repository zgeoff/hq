import { expect, test } from 'bun:test';
import { buildMockFleetView } from '../../../test/build-mock-fleet-view.ts';
import { formatFleetView } from './format-fleet-view.ts';

test('it prints a line per slot with the active mark, both windows, their resets and the read age, then the pause and the cap', () => {
  const view = buildMockFleetView({
    slots: [
      { slot: 1, active: true, status: '200', five: 12.4, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 40, sevenResetsAt: '2026-10-18T00:00:00Z', readAt: '2026-10-14T00:30:00Z', readAgeMin: 35 },
      { slot: 2, active: false, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, readAt: '2026-10-14T00:30:00Z', readAgeMin: 95 },
    ],
    forecast: { switches: [], pause: { start: '2026-10-16T08:00:00Z', end: '2026-10-18T00:00:00Z', hours: 40 }, safeCap: { lanes: 1, endsAt: '2026-10-18T12:00:00Z' }, endsAt: '2026-10-18T12:00:00Z' },
  });

  expect(formatFleetView(view)).toStrictEqual([
    'Fleet:',
    '  slot 1 (active): 5h 12% (resets 14 Oct 04:00Z), 7d 40% (resets 18 Oct 00:00Z), read 35 min ago',
    '  slot 2: no figures (403), read 1 h 35 min ago',
    '  burn now: 7d +1.00 pt/h, 5h +2.00 pt/h at 2 working lanes',
    '  fleet: pauses 16 Oct 08:00Z for 40.0 h at the current rate; a cap of 1 lasts until 18 Oct 12:00Z',
  ]);
});

test('it says there is no pause before the last reset', () => {
  expect(formatFleetView(buildMockFleetView()).at(-1)).toBe('  fleet: no pause before 18 Oct 00:00Z');
});

test('it notes that the burn is scaled by lane count', () => {
  expect(formatFleetView(buildMockFleetView({ scaled: true }))).toContain('  burn now: 7d +1.00 pt/h, 5h +2.00 pt/h at 2 working lanes (scaled by lane count: under 7 days of lane history)');
});

test('it says why there is no forecast', () => {
  const view = buildMockFleetView({ forecast: null, ratePerHour: null, note: 'slot reads are not set up' });

  expect(formatFleetView(view)).toStrictEqual(['Fleet:', '  fleet: no forecast, slot reads are not set up']);
});
