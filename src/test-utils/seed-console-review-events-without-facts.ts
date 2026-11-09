import type { TestDeps } from './test-deps.ts';

export function seedConsoleReviewEventsWithoutFacts(deps: TestDeps): void {
  // Console review events from before they kept the item's facts: recordConsoleReview always writes them.
  deps.db.run("UPDATE events SET data = json_remove(data, '$.facts') WHERE action = 'console-review'");
}
