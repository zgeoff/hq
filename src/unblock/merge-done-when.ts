import type { DoneWhen } from './types.ts';

export function mergeDoneWhen(stored: DoneWhen[], added: DoneWhen[]): DoneWhen[] {
  const merged = [...stored];
  for (const condition of added) {
    if (!merged.some((have) => have.kind === condition.kind && have.ref === condition.ref)) {
      merged.push(condition);
    }
  }
  return merged;
}
