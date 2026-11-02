import { repoCache } from '../review/repo-cache.ts';

const NOSLOP_OWNER = 'zgeoff';

export function resolveNoslopDir(): string {
  return `${repoCache()}/${NOSLOP_OWNER}/noslop`;
}
