import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { formatFocusLine } from './format-focus-line.ts';
import type { Focus, FocusReserve, FocusTerm } from './types.ts';

export interface FocusChange {
  terms: readonly FocusTerm[];
  reserves: readonly FocusReserve[];
  actor: string;
  at: Date;
}

// Sets the focus, logs it and posts it to hq news, in one transaction. The lanes read it at their
// next tick; running work keeps its slots. The caller reads the clock and passes the set time.
export function writeFocus(db: Database, change: FocusChange): Focus {
  const MAX_LINE = 300;
  const focus: Focus = { terms: [...change.terms], reserves: [...change.reserves], setAt: iso(change.at), setBy: change.actor };
  const line = formatFocusLine(focus);
  const shown = line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
  db.transaction(() => {
    db.query('INSERT INTO focus (id, terms, reserves, set_at, set_by) VALUES (1, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET terms = excluded.terms, reserves = excluded.reserves, set_at = excluded.set_at, set_by = excluded.set_by').run(
      JSON.stringify(focus.terms),
      JSON.stringify(focus.reserves),
      focus.setAt,
      change.actor,
    );
    logEvent(db, 'hq', 'focus', 'focus-set', change.actor, null, null, { terms: focus.terms.map((term) => term.text), reserves: focus.reserves });
    addNews(db, { from: change.actor, topic: 'other', text: `Lanes focus set: ${shown}. It applies from the next lanes tick.`, issue: null, link: null, needsGeoff: false, tag: 'focus' });
  }).immediate();
  return focus;
}
