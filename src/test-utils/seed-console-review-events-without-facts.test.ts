import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedConsoleReviewEventsWithoutFacts } from './seed-console-review-events-without-facts.ts';
import { seedEvent } from './seed-event.ts';

test('#seedConsoleReviewEventsWithoutFacts strips the facts from console review events only', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  seedEvent(fresh, { action: 'console-review', data: { facts: { pr: 7 }, review: 'lgtm' } });
  seedEvent(fresh, { action: 'probe', data: { facts: 1 } });

  seedConsoleReviewEventsWithoutFacts(fresh);

  expect(fresh.db.query('SELECT data FROM events ORDER BY seq').all()).toStrictEqual([{ data: '{"review":"lgtm"}' }, { data: '{"facts":1}' }]);
});
