import { seedAskAnswerEventWithNumber } from './seed-ask-answer-event-with-number.ts';
import { seedAskEventsWithoutDetail } from './seed-ask-events-without-detail.ts';
import { seedConsoleReviewEventsWithoutFacts } from './seed-console-review-events-without-facts.ts';
import { seedEvent } from './seed-event.ts';
import { seedEventWithBrokenData } from './seed-event-with-broken-data.ts';
import type { TestDeps } from './test-deps.ts';

export function buildEventSeeder(deps: TestDeps) {
  return {
    event: (input?: Parameters<typeof seedEvent>[1]) => seedEvent(deps, input),
    eventWithBrokenData: (input?: Parameters<typeof seedEventWithBrokenData>[1]) => seedEventWithBrokenData(deps, input),
    askEventsWithoutDetail: () => seedAskEventsWithoutDetail(deps),
    consoleReviewEventsWithoutFacts: () => seedConsoleReviewEventsWithoutFacts(deps),
    askAnswerEventWithNumber: () => seedAskAnswerEventWithNumber(deps),
  };
}
