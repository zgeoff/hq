import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { accountLabels } from '../accounts/account-labels.ts';
import { logEvent } from '../log-event.ts';
import { owner } from '../owner.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { capacitySettings } from './capacity-settings.ts';
import { openAlerts } from './open-alerts.ts';
import { RULES } from './rules.ts';
import type { CapacityInput, CapacityTick } from './types.ts';

// Evaluate one stored reading against the thresholds and send what is due. The hold rule: a breach
// (or a recovery) must last holdSamples samples in a row; a sample with no reading counts for neither.
// Quiet hours hold every message but an impd open; held opens go out once, if still open, with the
// held clears of alerts that were told.
export function checkCapacity(db: Database, input: CapacityInput, actor: string, at: Date = now()): CapacityTick {
  return db
    .transaction((): CapacityTick => {
      const COUNTS = z.record(z.string(), z.object({ bad: z.number(), good: z.number() })),
        HELD = z.array(z.object({ key: z.string(), label: z.string(), limit: z.string(), since: z.string(), until: z.string() })),
        TAIL = 'hq capacity shows every reading. hq changed nothing.',
        r = input.reading,
        s = capacitySettings(db);
      const ruleContext = { plan: input.plan, claudeLaunchPct: input.claudeLaunchPct ?? null };
      const hold = Math.max(1, Math.floor(s.holdSamples));
      const names = accountLabels(db);
      const open = openAlerts(db);
      const counts = metaJson(db, 'capacity_counts', COUNTS, {});
      const stamp = iso(at);
      const opened: string[] = [];
      const cleared: string[] = [];
      let held = metaJson(db, 'capacity_held', HELD, []);
      for (const rule of RULES) {
        const breach = rule.breached(r, s, ruleContext);
        const count = counts[rule.key] ?? { bad: 0, good: 0 };
        const current = open[rule.key];
        if (breach === null) {
          continue;
        }
        if (breach) {
          [count.bad, count.good] = [count.bad + 1, 0];
        } else {
          [count.bad, count.good] = [0, count.good + 1];
        }
        counts[rule.key] = count;
        if (breach && !current && count.bad >= hold) {
          open[rule.key] = { since: stamp, line: rule.line(r, s, names, ruleContext), told: false };
          opened.push(rule.key);
          // A recovery still held for an earlier run of this alert is stale now it is open again.
          held = held.filter((h) => h.key !== rule.key);
        } else if (breach && current) {
          current.line = rule.line(r, s, names, ruleContext);
        } else if (!breach && current && count.good >= hold) {
          const o = current;
          delete open[rule.key];
          cleared.push(rule.key);
          // An alert nobody was told about needs no all-clear.
          if (o.told) {
            held.push({ key: rule.key, label: rule.label, limit: rule.limit(s), since: o.since, until: stamp });
          }
        }
      }

      const quiet = isQuiet(at);
      const rule = (k: string) => RULES.find((x) => x.key === k)!;
      // Opens due now: every untold open alert, or in quiet hours only the urgent ones.
      const dueOpen = Object.entries(open).filter(([k, o]) => !o.told && (!quiet || rule(k).urgent)).map(([k]) => k);
      const targets = [...new Set([owner(), orchestratorName()])];
      // Clears due now: the held ones, when it is not quiet. (A quiet clear stays held, urgent or not.)
      const dueClear = quiet ? [] : held.splice(0, held.length);
      const stillOpen = (skip: string[]) => {
        const rest = Object.entries(open).filter(([k, o]) => o.told && !skip.includes(k));
        return rest.length ? `\nStill open:\n${rest.map(([, o]) => `- ${o.line} (since ${o.since})`).join('\n')}` : '';
      };
      // No outbox topic: a notice is never replaced or dropped, so "told" means queued, and the
      // outbox sends in order. After an atc outage the notices arrive late but complete; the hold
      // rule and one message per tick keep their number small.
      const send = (kind: string, text: string, detail: Record<string, unknown>) => {
        const seq = logEvent(db, 'hq', 'capacity', kind, actor, null, null, detail);
        for (const t of targets) enqueue(db, seq, t, text);
      };
      if (dueOpen.length) {
        const head = dueOpen.length > 1 ? `Capacity watch: ${dueOpen.length} things are over their line.` : 'Capacity watch: something is over its line.';
        send('alert', `${head}\n${dueOpen.map((k) => `- ${open[k]!.line}`).join('\n')}${stillOpen(dueOpen)}\n${TAIL}`, { opened: dueOpen });
      }
      for (const k of dueOpen) open[k]!.told = true;
      if (dueClear.length) {
        const lines = dueClear.map((h) => `- ${h.label} back under ${h.limit} (open ${span(h.since, h.until)})`);
        send('back-under', `Capacity watch: back under the line.\n${lines.join('\n')}${stillOpen([])}\n${TAIL}`, { cleared: dueClear.map((h) => h.key) });
      }
      setMeta(db, 'capacity_open', JSON.stringify(open));
      setMeta(db, 'capacity_counts', JSON.stringify(counts));
      setMeta(db, 'capacity_held', held.length ? JSON.stringify(held) : null);
      return { opened, cleared, told: { opened: dueOpen, cleared: dueClear.map((h) => h.key) } };
    })
    .immediate();
}

const span = (from: string, to: string) => {
  const min = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};
