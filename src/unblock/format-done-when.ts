import type { DoneWhen } from './types.ts';

export function formatDoneWhen(conditions: DoneWhen[], separator = ', '): string {
  return conditions.map((condition) => `${condition.kind}:${condition.ref}`).join(separator);
}
