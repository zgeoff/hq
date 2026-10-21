import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { OPEN } from './open.ts';
import type { Check, HealthTick, Samples } from './types.ts';

// The watcher's step: record the samples, tell z-stu about new problems, file news for cleared ones.
export function applyHealth(db: Database, checks: Check[], samples: Samples, actor: string, unknown: string[] = []): HealthTick {
  return db
    .transaction((): HealthTick => {
      const at = iso(now());
      setMeta(db, 'health_samples', JSON.stringify(samples));
      const open = metaJson(db, 'health_open', OPEN, {});
      const bad = checks.filter((c) => !c.ok);
      const opened = bad.filter((c) => !open[c.key]);
      const cleared: HealthTick['cleared'] = [];
      for (const [key, o] of Object.entries(open)) {
        if (!bad.some((c) => c.key === key) && !unknown.some((u) => key.startsWith(u))) {
          cleared.push({ key, line: o.line, since: o.since });
          delete open[key];
        }
      }
      for (const c of opened) open[c.key] = { since: at, line: c.line };
      setMeta(db, 'health_open', JSON.stringify(open));
      if (opened.length) {
        const seq = logEvent(db, 'hq', 'health', 'problem', actor, null, null, { opened: opened.map((c) => c.key) });
        const text = `Needs Geoff (hq health, read-only): ${opened.length} new problem${opened.length > 1 ? 's' : ''} on the PC:\n${opened.map((c) => `- ${c.line}`).join('\n')}\nhq health shows every check. hq stopped or restarted nothing.`;
        enqueue(db, seq, owner(), text);
      }
      for (const c of cleared) {
        logEvent(db, 'hq', 'health', 'cleared', actor, null, null, { key: c.key });
        addNews(db, { from: 'hq-health', topic: 'fix', text: `Cleared: ${c.line} (open since ${c.since})`.slice(0, 400), issue: null, link: null, needsGeoff: false });
      }
      return { checks, opened, cleared };
    })
    .immediate();
}
