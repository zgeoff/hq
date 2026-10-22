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
  const entries = (failed ?? []) as { id?: string; name?: string; reason?: string }[];
  const down: Settled['down'] = [];
  let waiting: { id: string; name: string; reason: string }[] = [];
  for (const f of entries) {
    const e = { id: String(f.id ?? ''), name: String(f.name ?? ''), reason: String(f.reason ?? '') };
    (e.id && e.reason.includes(WAITING) ? waiting : down).push(e);
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
