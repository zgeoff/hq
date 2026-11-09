import type { EnsureStep } from './types.ts';

// A respawn that worked needs nobody; an urgent step needs the owner whatever its action.
export function pickStepsToTell(told: readonly EnsureStep[]): { owner: EnsureStep[]; news: EnsureStep[] } {
  const news = told.filter((step) => step.action === 'spawned' && !step.urgent);
  return { owner: told.filter((step) => !news.includes(step)), news };
}
