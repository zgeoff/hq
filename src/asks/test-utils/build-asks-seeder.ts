import { seedAnsweredAsk } from './seed-answered-ask.ts';
import { seedAppliedAsk } from './seed-applied-ask.ts';
import { seedAsk } from './seed-ask.ts';
import { seedClosedAsk } from './seed-closed-ask.ts';
import { seedLaterAsk } from './seed-later-ask.ts';
import { seedOpenAsk } from './seed-open-ask.ts';
import { seedSecondOpenAsk } from './seed-second-open-ask.ts';
import { seedSkippedAsk } from './seed-skipped-ask.ts';
import type { AsksDeps } from './types.ts';

export function buildAsksSeeder(deps: AsksDeps) {
  return {
    ask: (input?: Parameters<typeof seedAsk>[1]) => seedAsk(deps, input),
    openAsk: (input?: Parameters<typeof seedAsk>[1]) => seedOpenAsk(deps, input),
    answeredAsk: (input?: Parameters<typeof seedAsk>[1]) => seedAnsweredAsk(deps, input),
    appliedAsk: (input?: Parameters<typeof seedAsk>[1]) => seedAppliedAsk(deps, input),
    laterAsk: (input?: Parameters<typeof seedAsk>[1]) => seedLaterAsk(deps, input),
    secondOpenAsk: (input?: Parameters<typeof seedAsk>[1]) => seedSecondOpenAsk(deps, input),
    skippedAsk: (input?: Parameters<typeof seedAsk>[1]) => seedSkippedAsk(deps, input),
    closedAsk: (input?: Parameters<typeof seedAsk>[1]) => seedClosedAsk(deps, input),
  };
}
