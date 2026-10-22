import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';

// Clears the focus, logs it and posts it to hq news; false when none was set, and then nothing is
// logged or posted.
export function removeFocus(db: Database, actor: string): boolean {
  return db
    .transaction(() => {
      const removed = db.query('DELETE FROM focus WHERE id = 1').run().changes > 0;
      if (removed) {
        logEvent(db, 'hq', 'focus', 'focus-cleared', actor, null, null, {});
        addNews(db, { from: actor, topic: 'other', text: 'Lanes focus cleared: the lanes take all eligible work by priority from the next lanes tick.', issue: null, link: null, needsGeoff: false, tag: 'focus' });
      }
      return removed;
    })
    .immediate();
}
