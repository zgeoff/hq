import { isRecord } from '@zgeoff/std';
import type { z } from 'zod';
import type { listedSchema } from './listed-schema.ts';
import type { Settled } from './types.ts';

// atc's restart report counts a session still restoring when it checks as failed
// ("waiting to restore"), and exits 1, though cloud restores often finish a minute
// later. Wait for those before the wake, so each one is woken and the log is honest.
const WAITING = 'waiting to restore';

type Listed = NonNullable<z.infer<typeof listedSchema>['sessions']>[number];

export async function settleRestores(
  failed: unknown[] | undefined,
  list: () => Promise<Listed[]>,
  opts: { timeoutMs: number; pollMs: number; sleep?: (ms: number) => Promise<void>; clock?: () => number },
): Promise<Settled> {
  const sleep = opts.sleep ?? Bun.sleep;
  const clock = opts.clock ?? Date.now;
  const down: Settled['down'] = [];
  let waiting: { id: string; name: string; reason: string }[] = [];
  for (const entry of failed ?? []) {
    const fields = isRecord(entry) ? entry : {};
    const restore = { id: String(fields['id'] ?? ''), name: String(fields['name'] ?? ''), reason: String(fields['reason'] ?? '') };
    (restore.id && restore.reason.includes(WAITING) ? waiting : down).push(restore);
  }
  const late: Settled['late'] = [];
  const until = clock() + opts.timeoutMs;
  while (waiting.length) {
    let sessions: Listed[] = [];
    try {
      sessions = await list();
    } catch {}
    const up = (id: string) => sessions.some((x) => x.id === id && x.alive === true && (x.lifecycle?.harness ?? 'running') === 'running');
    for (const w of waiting.filter((w) => up(w.id))) late.push({ id: w.id, name: w.name });
    waiting = waiting.filter((w) => !up(w.id));
    if (!waiting.length || clock() >= until) break;
    await sleep(opts.pollMs);
  }
  return { late, down: [...down, ...waiting] };
}
