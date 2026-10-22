import { config } from '../config/config.ts';

// A run from source (bun src/cli.ts) on the live database: HQ_LIVE=1 and no HQ_DB. It may read and
// write the live database, but never upgrade its schema: the installed hq would then refuse it.
export function isLiveSourceRun(): boolean {
  return !config().HQ_DB && !Bun.main.startsWith('/$bunfs/') && config().HQ_LIVE === '1';
}
