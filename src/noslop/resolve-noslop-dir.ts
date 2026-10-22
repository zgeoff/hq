import { repoCache } from '../review/repo-cache.ts';

const NOSLOP_OWNER = 'zgeoff';

// Hq's own base clone of noslop; `hq noslop pin` makes one folder per commit beside it.
export function resolveNoslopDir(): string {
  return `${repoCache()}/${NOSLOP_OWNER}/noslop`;
}
