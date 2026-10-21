import { config } from '../config/config.ts';

// A run from source (bun src/cli.ts) never touches the live database by
// accident: it needs HQ_DB, or HQ_LIVE=1 to mean the live one on purpose.
export function dbPath(): string {
  const named = config().HQ_DB;
  if (named) return named;
  const compiled = Bun.main.startsWith('/$bunfs/');
  if (!compiled && config().HQ_LIVE !== '1') {
    throw new Error('running from source: set HQ_DB to a scratch path (or HQ_LIVE=1 for the live database)');
  }
  return `${process.env['HOME']}/.local/share/z-sessions/hq.db`;
}
