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
import type { HealthMove } from './pick-health-moves.ts';
import { OWNER_FIX_MS, pickHealthMoves } from './pick-health-moves.ts';
import { match } from 'ts-pattern';
import type { Check, HealthTick, Samples } from './types.ts';

// The watcher's step: record the samples, decide each problem's move (pickHealthMoves), then write
// the open problems, the events, the messages and the news those moves call for.
export function applyHealth(db: Database, checks: Check[], samples: Samples, actor: string, unknown: string[] = []): HealthTick {
  return db
    .transaction((): HealthTick => {
      const at = iso(now());
      setMeta(db, 'health_samples', JSON.stringify(samples));
      const open = metaJson(db, 'health_open', OPEN, {});
      const moves = pickHealthMoves(open, checks, unknown, at);
      for (const move of moves) {
        match(move)
          .with({ action: 'reported' }, (reported) => {
            open[reported.key] = { since: at, line: reported.line };
          })
          .with({ action: 'asked' }, (asked) => {
            open[asked.key] = { since: at, line: asked.line, asked: asked.owner.session };
          })
          .with({ action: 'escalated' }, (escalated) => {
            open[escalated.key] = { since: escalated.since, line: escalated.line, asked: escalated.asked, escalated: true };
          })
          .with({ action: 'cleared' }, (cleared) => {
            delete open[cleared.key];
          })
          .exhaustive();
      }
      setMeta(db, 'health_open', JSON.stringify(open));
      sendHealthMessages(db, moves, actor);
      const opened = checks.filter((check) => moves.some((move) => move.key === check.key && (move.action === 'reported' || move.action === 'asked')));
      const cleared = moves.flatMap((move) => (move.action === 'cleared' ? [{ key: move.key, line: move.line, since: move.since }] : []));
      return { checks, opened, cleared };
    })
    .immediate();
}

function sendHealthMessages(db: Database, moves: HealthMove[], actor: string): void {
  const hours = OWNER_FIX_MS / 3_600_000;
  const reported = moves.filter((move) => move.action === 'reported');
  if (reported.length > 0) {
    const seq = logEvent(db, 'hq', 'health', 'problem', actor, null, null, { opened: reported.map((move) => move.key) });
    const text = `Needs Geoff (hq health, read-only): ${reported.length} new problem${reported.length > 1 ? 's' : ''} on the PC:\n${reported.map((move) => `- ${move.line}`).join('\n')}\nhq health shows every check. hq stopped or restarted nothing.`;
    enqueue(db, seq, owner(), text);
  }
  for (const move of moves) {
    if (move.action !== 'asked') {
      continue;
    }
    const seq = logEvent(db, 'hq', 'health', 'problem', actor, null, null, { opened: [move.key], asked: move.owner.session });
    const text = `hq health: ${move.line}. It is yours to fix: ${move.owner.ask}. If it still fails in ${hours} hours, hq tells ${owner()} as Needs Geoff.`;
    enqueue(db, seq, move.owner.session, text);
  }
  const escalated = moves.flatMap((move) => (move.action === 'escalated' ? [move] : []));
  if (escalated.length > 0) {
    const seq = logEvent(db, 'hq', 'health', 'escalated', actor, null, null, { keys: escalated.map((move) => move.key) });
    const lines = escalated.map((move) => `- ${move.line} (${move.asked} was asked at ${move.since})`);
    const text = `Needs Geoff (hq health, read-only): ${escalated.length} problem${escalated.length > 1 ? 's' : ''} still open ${hours} hours after hq asked the owning session to fix ${escalated.length > 1 ? 'them' : 'it'}:\n${lines.join('\n')}\nhq health shows every check.`;
    enqueue(db, seq, owner(), text);
  }
  for (const move of moves) {
    if (move.action !== 'cleared') {
      continue;
    }
    logEvent(db, 'hq', 'health', 'cleared', actor, null, null, { key: move.key });
    addNews(db, { from: 'hq-health', topic: 'fix', text: `Cleared: ${move.line.replaceAll(/\s*[\r\n]+\s*/gu, ' ')} (open since ${move.since})`.slice(0, 400), issue: null, link: null, needsGeoff: false });
  }
}
