import type { Database } from 'bun:sqlite';
import rulesTable from '../lanes.json';
import { readLinearReady } from '../src/lanes/read-linear-ready.ts';
import { validateLaneRules } from '../src/lanes/validate-lane-rules.ts';
import { writePromotableFocus } from '../src/lanes/write-promotable-focus.ts';
import { writePromotableTop } from '../src/lanes/write-promotable-top.ts';
import { buildReadyPage, makePagedCall } from './build-ready-page.ts';
import type { ReadyNodeSeed } from './build-ready-page.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';

// What a lanes tick test sets before a look: the Ready issues on the board, the stored promotable
// count and list, and the messages queued. The sample has three local slots and no imp ones.
export function createLanesLook(db: Database) {
  const rules = validateLaneRules(rulesTable, null);
  return {
    sample: { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } },

    // Stores `count` eligible Ready issues, read now.
    ready: async (count: number): Promise<void> => {
      const seeds: ReadyNodeSeed[] = Array.from({ length: count }, (_unused, index) => ({ identifier: `GEO-98${index}0`, project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }));
      await readLinearReady(db, { call: makePagedCall(buildReadyPage(seeds, null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
    },

    // Stores the promotable count, and a two-issue list unless `list` is false, as read at `readAt`.
    promotable: (count: number, readAt: string, options: { focus?: string; list?: boolean } = {}): void => {
      const focus = options.focus ?? '[]';
      writePromotableFocus(db, { count, focus, at: new Date(readAt), error: null });
      if (options.list !== false) {
        const issues = [
          { identifier: 'GEO-9701', title: 'whistle the kettle' },
          { identifier: 'GEO-9702', title: 'descale the kettle' },
        ];
        writePromotableTop(db, { issues, focus, at: new Date(readAt) });
      }
    },
    lowWater: () => db.query("SELECT target, text FROM outbox WHERE text LIKE 'Lanes: % eligible Ready for%' ORDER BY id").all(),
    stalled: () => db.query("SELECT target, text FROM outbox WHERE text LIKE 'Lanes: % slots empty for%' ORDER BY id").all(),
  };
}
