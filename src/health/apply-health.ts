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

// How long the session that owns a problem has to fix it before hq tells the owner's session.
export const OWNER_FIX_MS = 2 * 60 * 60 * 1000;

// The watcher's step: record the samples, ask each problem's owner to fix it, tell z-stu about new
// problems no session owns and about owned ones still open after OWNER_FIX_MS, file news for cleared ones.
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
      const unowned = opened.filter((check) => check.owner === undefined);
      for (const check of opened) {
        open[check.key] = check.owner === undefined ? { since: at, line: check.line } : { since: at, line: check.line, asked: check.owner.session };
      }
      if (unowned.length > 0) {
        const seq = logEvent(db, 'hq', 'health', 'problem', actor, null, null, { opened: unowned.map((check) => check.key) });
        const text = `Needs Geoff (hq health, read-only): ${unowned.length} new problem${unowned.length > 1 ? 's' : ''} on the PC:\n${unowned.map((check) => `- ${check.line}`).join('\n')}\nhq health shows every check. hq stopped or restarted nothing.`;
        enqueue(db, seq, owner(), text);
      }
      for (const check of opened) {
        if (check.owner === undefined) {
          continue;
        }
        const seq = logEvent(db, 'hq', 'health', 'problem', actor, null, null, { opened: [check.key], asked: check.owner.session });
        const text = `hq health: ${check.line}. It is yours to fix: ${check.owner.ask}. If it still fails in ${OWNER_FIX_MS / 3_600_000} hours, hq tells ${owner()} as Needs Geoff.`;
        enqueue(db, seq, check.owner.session, text);
      }
      const overdue = bad.flatMap((check) => {
        const entry = open[check.key];
        if (entry?.asked === undefined || entry.escalated === true || Date.parse(at) - Date.parse(entry.since) < OWNER_FIX_MS) {
          return [];
        }
        return [{ key: check.key, line: check.line, asked: entry.asked, entry }];
      });
      if (overdue.length > 0) {
        const seq = logEvent(db, 'hq', 'health', 'escalated', actor, null, null, { keys: overdue.map((item) => item.key) });
        const lines = overdue.map((item) => `- ${item.line} (${item.asked} was asked at ${item.entry.since})`);
        const text = `Needs Geoff (hq health, read-only): ${overdue.length} problem${overdue.length > 1 ? 's' : ''} still open ${OWNER_FIX_MS / 3_600_000} hours after hq asked the owning session to fix ${overdue.length > 1 ? 'them' : 'it'}:\n${lines.join('\n')}\nhq health shows every check.`;
        enqueue(db, seq, owner(), text);
        for (const item of overdue) {
          open[item.key] = { ...item.entry, escalated: true };
        }
      }
      setMeta(db, 'health_open', JSON.stringify(open));
      for (const c of cleared) {
        logEvent(db, 'hq', 'health', 'cleared', actor, null, null, { key: c.key });
        addNews(db, { from: 'hq-health', topic: 'fix', text: `Cleared: ${c.line.replaceAll(/\s*[\r\n]+\s*/gu, ' ')} (open since ${c.since})`.slice(0, 400), issue: null, link: null, needsGeoff: false });
      }
      return { checks, opened, cleared };
    })
    .immediate();
}
