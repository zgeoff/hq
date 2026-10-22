import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { buildNoslopReport } from './build-noslop-report.ts';
import { buildNoslopTotals } from './build-noslop-totals.ts';
import { buildRunDir } from './build-run-dir.ts';
import { readStoreMigrations } from './read-store-migrations.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { NoslopSettings } from './load-noslop-settings.ts';
import { formatStoreMigration } from './format-store-migration.ts';
import { renderNoslopReport } from './render-noslop-report.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import { resolveNoslopDefaultStore } from './resolve-noslop-default-store.ts';
import { requireNoslopIdle } from './require-noslop-idle.ts';
import { runStoreMigration } from './run-store-migration.ts';
import type { StoreMigration } from './run-store-migration.ts';
import { updateNoslopClone } from './update-noslop-clone.ts';
import { updateNoslopRepos } from './update-noslop-repos.ts';
import { withCloneLock } from './with-clone-lock.ts';
import { writeNoslopSettings } from './write-noslop-settings.ts';

export interface NoslopArgs {
  run: Runner;
  db: Database;
  verb: string | undefined;
  rest: string[];
  since: string | undefined;
  force?: boolean | undefined;
  actor: string;
}

export async function runNoslopCommand(args: NoslopArgs): Promise<Out> {
  if (args.verb === 'on' || args.verb === 'off') {
    return updateRepoList(args, args.verb);
  }
  if (args.verb === 'pin') {
    return await updatePin(args);
  }
  if (args.verb === 'report') {
    const reports = buildNoslopReport(args.db, args.since);
    return { data: { reports, totals: buildNoslopTotals(reports) }, text: renderNoslopReport(reports) };
  }
  if (args.verb === undefined || args.verb === 'show') {
    return renderSettings(args.db);
  }
  throw new HqError('bad_args', 'hq noslop [on <repo...> | off <repo...> | pin <sha> [--force <reason>] | report [--since ISO]]');
}

function updateRepoList(args: NoslopArgs, change: 'on' | 'off'): Out {
  const before = loadNoslopSettings(args.db),
    next = updateNoslopRepos(args.db, change, args.rest);
  logEvent(args.db, 'hq', 'noslop', change, args.actor, before.repos.join(','), next.repos.join(','), { repos: args.rest });
  return renderSettings(args.db);
}

function renderSettings(db: Database): Out {
  const settings = loadNoslopSettings(db);
  return { data: { repos: settings.repos, sha: settings.sha, clone: resolveRunDir(settings) }, text: formatSettings(settings) };
}

// The folder noslop runs from: the pinned commit's own, or the base clone before any pin.
function resolveRunDir(settings: NoslopSettings): string {
  return settings.sha === null ? resolveNoslopDir() : buildRunDir(resolveNoslopDir(), settings.sha);
}

function formatSettings(settings: NoslopSettings): string {
  const clone = resolveRunDir(settings),
    repos = settings.repos.length > 0 ? settings.repos.join(', ') : 'none (noslop is off everywhere)';
  return [
    `repos: ${repos}`,
    `pinned: ${settings.sha ?? 'nothing yet (hq noslop pin <sha>)'}`,
    `clone: ${clone}${existsSync(clone) ? '' : ' (not cloned yet)'}`,
  ].join('\n');
}

async function updatePin(args: NoslopArgs): Promise<Out> {
  const commit = requireSha(args.rest),
    force = requireForce(args),
    migration = await withCloneLock(() => updatePinLocked(args, commit, force)),
    shown = renderSettings(args.db);
  return { data: { ...shown.data, storeMigration: migration }, text: `${shown.text}\n${formatStoreMigration(migration)}` };
}

// The lock covers the idle check, checkout, install, the store migration and the meta write, so the
// recorded pin is the commit checked out and the store it migrated. Reviews take no lock, so the
// idle check runs again after the install, right before the migration query.
async function updatePinLocked(args: NoslopArgs, commit: string, force: string | undefined): Promise<StoreMigration> {
  const store = requireNoslopStore();
  requireStoreRestored(args.db, store);
  if (force === undefined) {
    await requireNoslopIdle(args.run);
  }
  return await updatePinStored(args, { commit, force, store });
}

interface PinPlan {
  commit: string;
  force: string | undefined;
  store: string;
}

async function updatePinStored(args: NoslopArgs, plan: PinPlan): Promise<StoreMigration> {
  const pinned = await updateNoslopClone(args.run, resolveNoslopDir(), plan.commit),
    requireIdle = plan.force === undefined ? () => requireNoslopIdle(args.run) : undefined,
    stored = await runStoreMigration({ run: args.run, store: plan.store, clone: pinned.clone, sha: pinned.sha, requireIdle }).catch((error: unknown) => {
      writeMigrationFailure(args.db, pinned.sha, error);
      throw error;
    }),

    // `hq noslop on` and `off` take no clone lock, so the list is read in the same transaction as the write.
    before = args.db.transaction(() => {
      const settings = loadNoslopSettings(args.db);
      writeNoslopSettings(args.db, { repos: settings.repos, sha: pinned.sha });
      return settings;
    }).immediate();
  logEvent(args.db, 'hq', 'noslop', 'pinned', args.actor, before.sha, pinned.sha, buildPinData(stored, plan.force));
  return stored;
}

// noslop never reads HQ_NOSLOP_STORE, so a migration it runs lands in its own store. A different
// path in the setting would have hq guard one file while noslop migrates another.
function requireNoslopStore(): string {
  const own = resolveNoslopDefaultStore(process.env),
    setting = config(process.env).HQ_NOSLOP_STORE;
  if (setting !== undefined && setting !== own) {
    throw new HqError('bad_args', `HQ_NOSLOP_STORE is ${setting}, but noslop opens ${own} and ignores that setting. Unset HQ_NOSLOP_STORE to pin.`);
  }
  return own;
}

const FAILED_KEY = 'noslop_store_migration_failed',
  FailedMigration = z.object({ sha: z.string(), names: z.array(z.string()), backup: z.string(), at: z.string() });

// A failed migration leaves the store holding its names, so the next pin would see nothing new to
// migrate and record the pin over the lost rows. The marker keeps every pin refused until the store
// is restored from the backup, which drops those names again; --force does not skip it.
function requireStoreRestored(db: Database, store: string): void {
  const failed = metaJson(db, FAILED_KEY, FailedMigration.nullable(), null);
  if (failed !== null) {
    requireFailedNamesGone(db, store, failed);
  }
}

function requireFailedNamesGone(db: Database, store: string, failed: z.infer<typeof FailedMigration>): void {
  const kept = collectHeldNames(store, failed.names);
  if (kept.length === 0) {
    setMeta(db, FAILED_KEY, null);
    return;
  }
  throw new HqError('store_migration_failed', `The store migration ${kept.join(', ')} failed at ${failed.at} (pin ${failed.sha}), and the store still holds it, so it was not restored from the backup ${failed.backup}. To restore it: stop noslop, remove ${store}-wal and ${store}-shm, then cp ${failed.backup} ${store}. Every pin stays refused until then.`, { backup: failed.backup, names: kept });
}

function collectHeldNames(store: string, names: string[]): string[] {
  if (!existsSync(store)) {
    return [];
  }
  const held = new Set(readStoreMigrations(store));
  return names.filter((name) => held.has(name));
}

function writeMigrationFailure(db: Database, sha: string, error: unknown): void {
  if (!(error instanceof HqError) || error.code !== 'store_migration_failed') {
    return;
  }
  const parsed = FailedMigration.omit({ sha: true, at: true }).safeParse(error.data);
  if (parsed.success) {
    const failed = { sha, names: parsed.data.names, backup: parsed.data.backup, at: iso(now()) };
    setMeta(db, FAILED_KEY, JSON.stringify(failed));
  }
}

function buildPinData(migration: StoreMigration, force: string | undefined): Record<string, unknown> {
  const counts = Object.fromEntries(migration.tables.map((count) => [count.table, { before: count.before, after: count.after }])),
    moved = migration.backup === null ? {} : { migrations: migration.names, backup: migration.backup, counts };
  return force === undefined ? moved : { ...moved, force };
}

function requireForce(args: NoslopArgs): string | undefined {
  if (args.force !== true) {
    return undefined;
  }
  const reason = args.rest.slice(1).join(' ').trim();
  if (reason === '') {
    throw new HqError('bad_args', 'hq noslop pin <sha> --force <reason> needs a reason, the words after the sha');
  }
  return reason;
}

const SHA_SHAPE = /^[0-9a-f]{7,40}$/iu;

function requireSha(rest: string[]): string {
  const [sha] = rest;
  if (sha === undefined || !SHA_SHAPE.test(sha)) {
    throw new HqError('bad_args', 'hq noslop pin <sha> needs a commit sha of 7 to 40 hex characters');
  }
  return sha;
}
