import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedAskEventsWithoutDetail } from './seed-ask-events-without-detail.ts';
import { seedEvent } from './seed-event.ts';

test('#seedAskEventsWithoutDetail strips the title, issues and session from ask events only', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  seedEvent(fresh, { subject: 'ask', data: { title: 'Pick a lid', issues: ['GEO-9001'], forSession: 'kettle-bot', keep: 1 } });
  seedEvent(fresh, { subject: 'hq', data: { title: 'Kept' } });

  seedAskEventsWithoutDetail(fresh);

  expect(fresh.db.query('SELECT data FROM events ORDER BY seq').all()).toStrictEqual([{ data: '{"keep":1}' }, { data: '{"title":"Kept"}' }]);
});
