import { config } from '../config/config.ts';

// A run from source on the live database never upgrades its schema: the installed hq would then
// refuse it.
export function isLiveSourceRun(): boolean {
  return !config().HQ_DB && !Bun.main.startsWith('/$bunfs/') && config().HQ_LIVE === '1';
}
