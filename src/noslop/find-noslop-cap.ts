import type { NoslopSettings } from './load-noslop-settings.ts';

const NOSLOP_OWNER = 'zgeoff';

// Matched as the noslop list matches a repo: the zgeoff owner, and the name in any case.
export function findNoslopCap(settings: NoslopSettings, owner: string, repo: string): number | null {
  if (owner.toLowerCase() !== NOSLOP_OWNER) {
    return null;
  }
  const found = Object.entries(settings.caps).find(([name]) => name.toLowerCase() === repo.toLowerCase());
  return found?.[1] ?? null;
}
