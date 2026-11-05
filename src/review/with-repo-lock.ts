import { config } from '../config/config.ts';
import { withExclusiveLock } from './with-exclusive-lock.ts';

// Same-repo reviews share one checkout: a lock per repo around the git steps that change it, so
// parallel fetches don't race on its refs.
export async function withRepoLock<T>(directory: string, slug: string, fn: () => Promise<T>): Promise<T> {
  return await withExclusiveLock(`${directory}/.flock-${slug.replace('/', '-')}`, 'another review', fn, config().HQ_REVIEW_LOCK_WAIT_MS);
}
