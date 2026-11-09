import type { TestDeps } from './build-seeder.ts';
import { seedAskAnswerEventWithNumber } from './seed-ask-answer-event-with-number.ts';
import { seedAskEventsWithoutDetail } from './seed-ask-events-without-detail.ts';
import { seedConsoleReviewEventsWithoutFacts } from './seed-console-review-events-without-facts.ts';
import { seedEvent } from './seed-event.ts';
import { seedEventWithBrokenData } from './seed-event-with-broken-data.ts';

export function buildEventSeeder(deps: TestDeps) {
  return {
    event: (input?: Parameters<typeof seedEvent>[1]) => seedEvent(deps, input),
    eventWithBrokenData: (input?: Parameters<typeof seedEventWithBrokenData>[1]) => seedEventWithBrokenData(deps, input),
    askEventsWithoutDetail: (input?: Parameters<typeof seedAskEventsWithoutDetail>[1]) => seedAskEventsWithoutDetail(deps, input),
    consoleReviewEventsWithoutFacts: (input?: Parameters<typeof seedConsoleReviewEventsWithoutFacts>[1]) => seedConsoleReviewEventsWithoutFacts(deps, input),
    askAnswerEventWithNumber: (input?: Parameters<typeof seedAskAnswerEventWithNumber>[1]) => seedAskAnswerEventWithNumber(deps, input),
  };
}
