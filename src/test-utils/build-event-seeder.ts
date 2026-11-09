import type { TestDeps } from './build-seeder.ts';
import { seedEvent } from './seed-event.ts';
import { seedEventWithBrokenData } from './seed-event-with-broken-data.ts';

export function buildEventSeeder(deps: TestDeps) {
  return {
    event: (input?: Parameters<typeof seedEvent>[1]) => seedEvent(deps, input),
    eventWithBrokenData: (input?: Parameters<typeof seedEventWithBrokenData>[1]) => seedEventWithBrokenData(deps, input),
  };
}
