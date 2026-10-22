import type { NoslopSettings } from './load-noslop-settings.ts';

const NOSLOP_OWNER = 'zgeoff';

// GitHub names ignore case, so the list does too: `ZGeoff/Tools` is the listed `tools`.
export function isNoslopListed(settings: NoslopSettings, owner: string, repo: string): boolean {
  return owner.toLowerCase() === NOSLOP_OWNER && settings.repos.some((name) => name.toLowerCase() === repo.toLowerCase());
}
