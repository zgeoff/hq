import { expect, test } from 'bun:test';
import { buildMockFleetView } from './build-mock-fleet-view.ts';

test('it builds a default fleet view with no pause', () => {
  expect(buildMockFleetView()).toStrictEqual({
    notSetUp: null,
    limit: 95,
    active: 1,
    slots: [],
    lanes: { working: 2, cap: null },
    ratePerHour: { five: 2, seven: 1 },
    scaled: null,
    forecast: { switches: [], pause: null, safeCap: null, endsAt: '2026-10-18T00:00:00Z' },
    note: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockFleetView({ active: 3, notSetUp: 'no settings file' })).toMatchObject({ active: 3, notSetUp: 'no settings file', limit: 95 });
});
