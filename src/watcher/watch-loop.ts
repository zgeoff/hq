// The hq-lanes watcher (GEO-1021, from cli.ts): one loop, every 300 s by default. Each step has a
// deadline and every command it runs has one too, so a hung call costs one step, not the loop
// (GEO-1015). A tick that completes records its time; `hq fleet ensure`, a separate timer, tells
// z-stu when that time is over 15 minutes old.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { STARTED } from './started.ts';
import type { WatchDeps } from './types.ts';
import { watchTick } from './watch-tick.ts';

export async function watchLoop(db: Database, d: WatchDeps, intervalMs: number): Promise<never> {
  setMeta(db, STARTED, iso(now()));
  for (;;) {
    await watchTick(db, d);
    await Bun.sleep(intervalMs);
  }
}
