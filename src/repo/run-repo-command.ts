import type { Database } from 'bun:sqlite';
import { dbPath } from '../db/db-path.ts';
import { HqError } from '../errors.ts';
import { resolveNoslopDefaultStore } from '../noslop/resolve-noslop-default-store.ts';
import { reviewDir } from '../review/review-dir.ts';
import type { Runner } from '../runner/types.ts';
import { formatArchiveHistory } from './format-archive-history.ts';
import type { RepoNames } from './rekey-specs.ts';
import { runArchiveHistory } from './run-archive-history.ts';
import type { CreateBackup, OpenStore } from './types.ts';

export interface RepoCommandArgs {
  actor: string;
  createBackup: CreateBackup;
  db: Database;
  dryRun: boolean;
  openStore: OpenStore;
  rest: string[];
  run: Runner;
  verb: string | undefined;
}

// hq repo archive-history <from> <to> [--dry-run]
export async function runRepoCommand(args: RepoCommandArgs): Promise<{ data: Record<string, unknown>; text: string }> {
  if (args.verb !== 'archive-history') {
    throw new HqError('bad_args', `unknown command: hq repo ${args.verb ?? ''}. Try hq repo archive-history <from> <to>`);
  }
  return await runArchiveCommand(args, parseArchiveNames(args.rest));
}

function parseArchiveNames(rest: string[]): RepoNames {
  const [from, to] = rest;
  if (from === undefined || to === undefined || rest.length !== 2) {
    throw new HqError('bad_args', 'hq repo archive-history takes two repo names: <from> <to>');
  }
  return { from, to };
}

async function runArchiveCommand(args: RepoCommandArgs, names: RepoNames): Promise<{ data: Record<string, unknown>; text: string }> {
  const history = await runArchiveHistory({
    actor: args.actor,
    createBackup: args.createBackup,
    db: args.db,
    dbFile: dbPath(),
    dryRun: args.dryRun,
    from: names.from,
    openStore: args.openStore,
    reviewDir: reviewDir(),
    run: args.run,
    store: resolveNoslopDefaultStore(process.env),
    to: names.to,
  });
  return { data: { history }, text: formatArchiveHistory(history) };
}
