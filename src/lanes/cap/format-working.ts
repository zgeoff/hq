import type { CapView } from './build-cap-view.ts';

export function formatWorking(view: Pick<CapView, 'working' | 'workingFrom'>): string {
  return view.workingFrom === 'sessions' ? `${view.working} working` : `${view.working} working (counted by run: the atc reading is stale)`;
}
