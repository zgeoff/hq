import type { KeptSession, WrapUp } from './types.ts';

export function formatWrapUp(wrapUp: WrapUp): string {
  const parts = [
    wrapUp.forgotten.length > 0 ? `forgot ${wrapUp.forgotten.map(toShortID).join(', ')}` : null,
    wrapUp.destroyed.length > 0 ? `destroyed the imp of ${wrapUp.destroyed.map(toShortID).join(', ')}` : null,
    ...wrapUp.kept.map((kept) => `kept ${formatSession(kept)}`),
    ...wrapUp.failed.map((failed) => `failed ${formatSession(failed)}`),
  ].filter((part) => part !== null);
  return `Wrap-up: ${parts.length > 0 ? parts.join('; ') : 'no session of the run is in atc'}.`;
}

function toShortID(id: string): string {
  return id.slice(0, 8);
}

function formatSession(session: KeptSession): string {
  return `${toShortID(session.id)} (${session.reason})`;
}
