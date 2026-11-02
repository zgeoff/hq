import type { Database } from 'bun:sqlite';
import rulesTable from '../lanes.json';
import { readLinearReady } from '../src/lanes/read-linear-ready.ts';
import { validateLaneRules } from '../src/lanes/validate-lane-rules.ts';
import { writePromotableFocus } from '../src/lanes/write-promotable-focus.ts';
import { writePromotableTop } from '../src/lanes/write-promotable-top.ts';
import { buildReadyPage, makePagedCall } from './build-ready-page.ts';
import type { ReadyNodeSeed } from './build-ready-page.ts';
import { buildStubGitHubFactsRunner } from './build-stub-github-facts-runner.ts';

export function createLanesLook(db: Database) {
  const rules = validateLaneRules(rulesTable, null);
  return {
    sample: { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } },

    ready: async (count: number): Promise<void> => {
      const seeds: ReadyNodeSeed[] = Array.from({ length: count }, (_unused, index) => ({ identifier: `GEO-98${index}0`, project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }));
      await readLinearReady(db, { call: makePagedCall(buildReadyPage(seeds, null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
    },

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
