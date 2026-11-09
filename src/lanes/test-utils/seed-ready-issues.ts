import rulesTable from '../../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../../test/build-stub-github-facts-runner.ts';
import { readLinearReady } from '../read-linear-ready.ts';
import { validateLaneRules } from '../validate-lane-rules.ts';
import type { LanesDeps } from './types.ts';

export async function seedReadyIssues(deps: LanesDeps, issues: ReadyNodeSeed[]): Promise<void> {
  await readLinearReady(deps.db, {
    call: makePagedCall(buildReadyPage(issues, null)),
    run: buildStubGitHubFactsRunner({}),
    actor: 'hq-lanes',
    rules: validateLaneRules(rulesTable, null),
  });
}
