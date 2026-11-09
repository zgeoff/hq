import { seedBlockedRun } from './seed-blocked-run.ts';
import { seedClosedRunPr } from './seed-closed-run-pr.ts';
import { seedDeployHeldRun } from './seed-deploy-held-run.ts';
import { seedDeployingRun } from './seed-deploying-run.ts';
import { seedDoneRun } from './seed-done-run.ts';
import { seedDroppedRun } from './seed-dropped-run.ts';
import { seedFinalRunPr } from './seed-final-run-pr.ts';
import { seedLiveCheckRun } from './seed-live-check-run.ts';
import { seedMergedRun } from './seed-merged-run.ts';
import { seedMergedRunPr } from './seed-merged-run-pr.ts';
import { seedRun } from './seed-run.ts';
import { seedRunBeforeDesignLanes } from './seed-run-before-design-lanes.ts';
import { seedRunPr } from './seed-run-pr.ts';
import { seedRunPrWithoutRun } from './seed-run-pr-without-run.ts';
import { seedRunSession } from './seed-run-session.ts';
import type { RunsDeps } from './types.ts';

export function buildRunSeeder(deps: RunsDeps) {
  return {
    run: (input?: Parameters<typeof seedRun>[1]) => seedRun(deps, input),
    blockedRun: (input?: Parameters<typeof seedRun>[1]) => seedBlockedRun(deps, input),
    mergedRun: (input?: Parameters<typeof seedRun>[1]) => seedMergedRun(deps, input),
    deployingRun: (input?: Parameters<typeof seedRun>[1]) => seedDeployingRun(deps, input),
    deployHeldRun: (input?: Parameters<typeof seedRun>[1]) => seedDeployHeldRun(deps, input),
    liveCheckRun: (input?: Parameters<typeof seedRun>[1]) => seedLiveCheckRun(deps, input),
    doneRun: (input?: Parameters<typeof seedRun>[1]) => seedDoneRun(deps, input),
    droppedRun: (input?: Parameters<typeof seedRun>[1]) => seedDroppedRun(deps, input),
    runBeforeDesignLanes: (input?: Parameters<typeof seedRun>[1]) => seedRunBeforeDesignLanes(deps, input),
    runSession: (input?: Parameters<typeof seedRunSession>[1]) => seedRunSession(deps, input),
    runPr: (input?: Parameters<typeof seedRunPr>[1]) => seedRunPr(deps, input),
    mergedRunPr: (input?: Parameters<typeof seedMergedRunPr>[1]) => seedMergedRunPr(deps, input),
    finalRunPr: (input?: Parameters<typeof seedFinalRunPr>[1]) => seedFinalRunPr(deps, input),
    closedRunPr: (input?: Parameters<typeof seedRunPr>[1]) => seedClosedRunPr(deps, input),
    runPrWithoutRun: (input?: Parameters<typeof seedRunPrWithoutRun>[1]) => seedRunPrWithoutRun(deps, input),
  };
}
