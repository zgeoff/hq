import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { ORPCError } from '@orpc/client';
import { openDb } from '../src/db/open-db.ts';
import { buildFakeAtcState } from './build-fake-atc-state.ts';
import type { FakeAtcState } from './build-fake-atc-state.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';

// A refused fetch retries after HQ_FETCH_RETRY_MS: no wait in tests.
process.env['HQ_FETCH_RETRY_MS'] ??= '0';
// A ref-lock fetch retries after HQ_REF_LOCK_RETRY_MS: no wait in tests.
process.env['HQ_REF_LOCK_RETRY_MS'] ??= '0';
// gh searches are spaced by HQ_SEARCH_GAP_MS: no wait in tests.
process.env['HQ_SEARCH_GAP_MS'] ??= '0';

// The value of an environment variable a test has set up; a missing one fails the test.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// A fresh database per test, in a temp dir. Messages stay in the outbox unless a test turns them on.
export function freshDb(): { db: Database; dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-test-'));
  const path = join(dir, 'hq.db');
  process.env['HQ_DB'] = path;
  const db = openDb(path);

  // A test database needs no crash safety, and an fsync per commit made a 62-run release test take 6-10 s under host load.
  db.exec('PRAGMA synchronous = OFF;');
  return { db, dir, path, cleanup: () => (db.close(), rmSync(dir, { recursive: true, force: true })) };
}

// 01:00Z on 14 Oct 2026 is 12:00 in Sydney (AEDT, UTC+11): awake hours.
// Marks the goals data fetched for every UTC day in [from, to]: CI for each repo, and merged PRs.
// Without it, a goal measure counts the days as not fetched and gives no colour.
export function fetchedDays(db: Database, from = '2026-09-01', to = '2026-11-30', repos = ['atc']): void {
  const ci = db.query(`INSERT OR IGNORE INTO goal_days (kind, key, day, n, at) VALUES ('ci', ?, ?, 0, '2026-09-01T00:00:00Z')`);
  const pr = db.query(`INSERT OR IGNORE INTO merged_pr_days (day, n, at) VALUES (?, 0, '2026-09-01T00:00:00Z')`);
  db.transaction(() => {
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      for (const r of repos) ci.run(r, d);
      pr.run(d);
    }
  })(); // one commit: a commit per row makes each test seconds slower
}

export const NOON_SYDNEY = '2026-10-14T01:00:00Z';
// 17:00Z on 14 Oct is 04:00 on 15 Oct in Sydney: quiet hours.
export const FOUR_AM_SYDNEY = '2026-10-14T17:00:00Z';

export function at(t: string): void {
  process.env['HQ_NOW'] = t;
}

interface FeedEvent {
  at: number;
  session: string;
  name: string | null;
  kind: string;
  detail: string | null;
  label?: string;
}

export interface FakeAtc extends FakeAtcState {
  path: string;
  feed: FeedEvent[];
  activity: Map<string, number>;
  sent: { session: string; text: string; from: string; idempotencyKey: string; notice?: boolean }[];
  onMessage: (() => void) | null; // runs after each new message is recorded
  stop: () => void;
}

// A unix socket that speaks atc's protocol 8 peer wire: hello, session.list, session.get,
// atc 6.0.0 and 7.0.0's events cursor: the tuple ["events", id], base64url.
function encodeCursor(id: number): string {
  return Buffer.from(JSON.stringify(['events', id])).toString('base64url');
}

function decodeCursor(cursor: string): number {
  const wire: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
  if (!Array.isArray(wire) || wire[0] !== 'events' || typeof wire[1] !== 'number') {
    throw new Error('not an events cursor');
  }
  return wire[1];
}

function readFeedStart(cursor: string): number {
  try {
    return decodeCursor(cursor);
  } catch {
    throw new ORPCError('bad_args', { message: `'${cursor}' is not an events.read cursor` });
  }
}

// events.read, session.message.
export function fakeAtc(dir: string, sessions = [
  { id: 'id-stu', name: 'z-stu', alive: true, state: 'done' },
  { id: 'id-refine', name: 'z-refine', alive: true, state: 'done' },
  { id: 'id-steward', name: 'z-steward', alive: true, state: 'done' },
  { id: 'id-delivery', name: 'z-delivery', alive: true, state: 'done' },
]): FakeAtc {
  const path = join(dir, 'atc.sock');
  const sent: FakeAtc['sent'] = [];
  const seen = new Map<string, string>();
  const feed: FeedEvent[] = [];
  const activity = new Map<string, number>();
  const fake = { onMessage: null } as unknown as FakeAtc;
  fake.stop = startStubAtcDaemon(path, {
    'session.list': () => ({ sessions }),
    'session.get': (input) => {
      const id = (input as { session?: string }).session ?? '',
        left = fake.getBudgets.get(id);
      if (left !== undefined) {
        if (left <= 0) {
          throw new ORPCError('internal', { message: 'invented session.get failure' });
        }
        fake.getBudgets.set(id, left - 1);
      }
      return { session: sessions.find((x) => x.id === id), prompt: fake.prompts.get(id) ?? null, lastActivityAt: activity.get(id) ?? 0, pending: null, result: null, sessionRecord: null };
    },
    'events.read': (input) => {
      // Like atc: no cursor reads the newest page.
      const args = input as { cursor?: string; limit?: number },
        count = args.limit ?? 50,
        first = args.cursor === undefined ? Math.max(0, feed.length - count) : readFeedStart(args.cursor),
        last = Math.max(first, Math.min(feed.length, first + count)),
        page = feed.slice(first, last).map((event, k) => Object.assign(structuredClone(event), { cursor: encodeCursor(first + k + 1) }));
      return { events: page, cursor: encodeCursor(last), more: last < feed.length };
    },
    'session.spawn': (input) => {
      const id = `spawned-${sessions.length + 1}`,
        raw = input as { name: string; prompt: string };
      sessions.push({ id, name: raw.name, alive: true, state: 'done' });
      fake.prompts.set(id, raw.prompt);
      fake.calls.push({ method: 'session.spawn', input });
      return { session: { id } };
    },
    'session.kill': (input) => {
      const found = sessions.find((x) => x.id === (input as { session: string }).session);
      if (found) {
        Object.assign(found, { alive: false, state: 'exited' });
      }
      fake.calls.push({ method: 'session.kill', input });
      return { stopped: true };
    },
    'session.update': (input) => {
      const found = sessions.find((x) => x.id === (input as { session: string }).session),
        pinned = (input as { pinned?: boolean }).pinned,
        refused = pinned === true && fake.pinFailures.has((input as { session: string }).session);
      fake.calls.push({ method: 'session.update', input });
      if (refused) {
        throw new ORPCError('update_failed', { message: 'invented pin failure' });
      }
      if (found && pinned !== undefined) {
        Object.assign(found, { pinned });
      }
      return {};
    },
    'session.forget': (input) => {
      const id = (input as { session: string }).session;
      fake.calls.push({ method: 'session.forget', input });
      if (fake.forgetRefusals.has(id)) {
        throw new ORPCError('session_pinned', { message: `${id} is pinned` });
      }
      if (fake.forgetTokens.has(id)) {
        return { confirmToken: 'invented-token' };
      }
      sessions.splice(0, sessions.length, ...sessions.filter((x) => x.id !== id));
      return { forgotten: true, destroyed: false };
    },
    'message.get': (input) => {
      const id = (input as { message: string }).message,
        message = sent[[...seen.values()].indexOf(id)];
      if (!message) {
        throw new ORPCError('not_found', { message: `no message ${id}` });
      }
      if (fake.messageFailures.has(id)) {
        throw new ORPCError('internal', { message: 'invented message.get failure' });
      }
      return {
        message: id,
        session: message.session,
        from: message.from,
        sender: { kind: 'local', name: message.from },
        text: message.text,
        status: 'delivered',
        sentAt: 1_792_499_100_360,
        deliveredAt: 1_792_499_100_377,
        answeredAt: null,
        answer: null,
        turn: null,
        answeredWith: [],
        ...fake.messages.get(id),
      };
    },
    'session.message': (input) => {
      const raw = input as FakeAtc['sent'][number];
      if (!seen.has(raw.idempotencyKey)) {
        seen.set(raw.idempotencyKey, `m-${seen.size + 1}`);
        sent.push(raw);
        fake.onMessage?.();
      }
      return { message: seen.get(raw.idempotencyKey), status: 'queued' };
    },
  }).stop;
  process.env['HQ_ATC_SOCKET'] = path;
  Object.assign(fake, buildFakeAtcState(), { path, sent, feed, activity });
  return fake;
}

interface RepoFixture {
  dir: string;
  push: (files: Record<string, string>) => void;
}

function runGit(cwd: string, ...args: string[]): void {
  const r = Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
}

// An origin repo with a main branch under `${dir}/${origin}`, and a clone of it at `${dir}/${clone}`.
function createOriginClone(dir: string, origin: string, clone: string, files: Record<string, string>): RepoFixture {
  const originDir = join(dir, origin);
  const push = (f: Record<string, string>) => {
    for (const [path, text] of Object.entries(f)) {
      mkdirSync(dirname(join(originDir, path)), { recursive: true });
      writeFileSync(join(originDir, path), text);
    }
    runGit(originDir, 'add', '-A');
    runGit(originDir, 'commit', '-q', '-m', 'invented change');
  };
  mkdirSync(originDir, { recursive: true });
  runGit(originDir, 'init', '-q', '-b', 'main');
  push(files);
  runGit(dir, 'clone', '-q', originDir, join(dir, clone));
  return { dir: join(dir, clone), push };
}

// An hq-defs stand-in: an origin repo with a main branch, and a clone at `${dir}/defs` that is the
// skills tree (HQ_DEFINITIONS_DIR). push() commits files on origin's main.
export function createHqDefsRepo(dir: string, files: Record<string, string>): { defs: string; push: (files: Record<string, string>) => void } {
  const repo = createOriginClone(dir, 'origin', 'defs', files);
  process.env['HQ_DEFINITIONS_DIR'] = repo.dir;
  return { defs: repo.dir, push: repo.push };
}

// Both trees, each with its own origin: an hq-defs stand-in with a placeholder file, and an
// hq-private stand-in at `${dir}/private` (HQ_PRIVATE_DIR) holding `files`. hq reads start prompts
// through hq-private's origin/main, and push() commits files there.
export function createDefsRepo(dir: string, files: Record<string, string>): { defs: string; private: string; push: (files: Record<string, string>) => void } {
  const hq = createHqDefsRepo(dir, { 'README.md': 'invented skills tree\n' }),
    hqPrivate = createOriginClone(dir, 'private-origin', 'private', files);
  process.env['HQ_PRIVATE_DIR'] = hqPrivate.dir;
  return { defs: hq.defs, private: hqPrivate.dir, push: hqPrivate.push };
}
