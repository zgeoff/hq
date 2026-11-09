import type { TestDeps } from './test-deps.ts';

export function seedAskEventsWithoutDetail(deps: TestDeps): void {
  // Ask events from before they kept a title, issues and session: addAsk always writes all three.
  deps.db.run("UPDATE events SET data = json_remove(data, '$.title', '$.issues', '$.forSession') WHERE subject = 'ask'");
}
