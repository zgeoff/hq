import type { FleetView } from '../src/capacity/fleet/types.ts';

// A fleet view with no pause forecast: active slot 1, no cap, 2 working lanes.
export function buildMockFleetView(overrides: Partial<FleetView> = {}): FleetView {
  return {
    notSetUp: null,
    limit: 95,
    active: 1,
    slots: [],
    lanes: { working: 2, cap: null },
    ratePerHour: { five: 2, seven: 1 },
    scaled: false,
    forecast: { switches: [], pause: null, safeCap: null, endsAt: '2026-10-18T00:00:00Z' },
    note: null,
    ...overrides,
  };
}
