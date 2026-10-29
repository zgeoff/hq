import type { KeptSession, WrapUp } from './types.ts';

type WrapUpTense = 'done' | 'planned';

const VERBS: Record<WrapUpTense, { forget: string; destroy: string; keep: string; fail: string }> = {
  done: { forget: 'forgot', destroy: 'destroyed the imp of', keep: 'kept', fail: 'failed' },
  planned: { forget: 'would forget', destroy: 'would destroy the imp of', keep: 'would keep', fail: 'would fail' },
};

export function formatWrapUp(wrapUp: WrapUp, tense: WrapUpTense = 'done'): string {
  const verbs = VERBS[tense];
  const parts = [
    wrapUp.forgotten.length > 0 ? `${verbs.forget} ${wrapUp.forgotten.map(toShortID).join(', ')}` : null,
    wrapUp.destroyed.length > 0 ? `${verbs.destroy} ${wrapUp.destroyed.map(toShortID).join(', ')}` : null,
    ...wrapUp.kept.map((kept) => `${verbs.keep} ${formatSession(kept)}`),
    ...wrapUp.failed.map((failed) => `${verbs.fail} ${formatSession(failed)}`),
  ].filter((part) => part !== null);
  return `Wrap-up: ${parts.length > 0 ? parts.join('; ') : 'no session of the run is in atc'}.`;
}

function toShortID(id: string): string {
  return id.slice(0, 8);
}

function formatSession(session: KeptSession): string {
  return `${toShortID(session.id)} (${session.reason})`;
}
