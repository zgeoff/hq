import type { EnsureStep } from './types.ts';

// A respawn that worked needs nobody; an urgent step needs the owner whatever its action. A stale
// restart posts its own news line, which says why, so its respawn posts none here.
export function pickStepsToTell(told: readonly EnsureStep[], restarting: ReadonlySet<string>): { owner: EnsureStep[]; news: EnsureStep[] } {
  const quiet = told.filter((step) => step.action === 'spawned' && !step.urgent);
  return { owner: told.filter((step) => !quiet.includes(step)), news: quiet.filter((step) => !restarting.has(step.name)) };
}
