import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCheapResticKey } from './write-cheap-restic-key.ts';

// Every restic repo the tests make shares this password, so one pair of templates serves them all.
export const RESTIC_TEST_PASSWORD = 'invented-kettle-password';

// An empty `local` and `remote` repo, built once per machine under a lock. A calibrated key costs
// about 0.75 s per restic call, so each key is rewritten cheap. The remote is initialised from the
// local with hq's flags for a new remote, so `restic copy` between copies of the two works.
export function createResticTemplates(): string {
  const version = Bun.spawnSync(['restic', 'version']).stdout.toString();
  const rewrite = readFileSync(join(import.meta.dir, 'write-cheap-restic-key.ts'), 'utf8');
  const key = createHash('sha256').update(`${version}\n${RESTIC_TEST_PASSWORD}\n${rewrite}`).digest('hex').slice(0, 16);
  const root = join(tmpdir(), 'hq-tests-restic-template');
  const templates = join(root, key);
  if (existsSync(templates)) {
    return templates;
  }
  mkdirSync(root, { recursive: true });
  const lock = new Database(join(root, 'build-lock.sqlite'), { create: true });
  lock.run('PRAGMA busy_timeout = 30000');
  lock.run('BEGIN IMMEDIATE');
  try {
    if (!existsSync(templates)) {
      createTemplatesAt(root, templates);
    }
  } finally {
    lock.run('COMMIT');
    lock.close();
  }
  return templates;
}

// Built beside the templates and renamed into place, so no reader ever sees half a repo.
function createTemplatesAt(root: string, templates: string): void {
  const scratch = mkdtempSync(join(root, 'building-'));
  try {
    const password = join(scratch, 'password');
    writeFileSync(password, `${RESTIC_TEST_PASSWORD}\n`, { mode: 0o600 });
    const built = join(scratch, 'templates');
    const local = join(built, 'local');
    const remote = join(built, 'remote');
    runRestic(['-r', local, 'init', '--no-cache', '--password-file', password]);
    writeCheapResticKey(local, RESTIC_TEST_PASSWORD);
    runRestic(['-r', remote, 'init', '--no-cache', '--password-file', password, '--from-repo', local, '--from-password-file', password, '--copy-chunker-params']);
    writeCheapResticKey(remote, RESTIC_TEST_PASSWORD);
    renameSync(built, templates);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function runRestic(args: string[]): void {
  const run = Bun.spawnSync(['restic', ...args], { env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' } });
  if (run.exitCode !== 0) {
    throw new Error(`restic ${args[2]} failed: ${run.stderr.toString()}`);
  }
}
