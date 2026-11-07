import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { ORPCError } from '@orpc/client';
import { toExactOptional } from '@zgeoff/std';
import { z } from 'zod';
import { openDb } from '../src/db/open-db.ts';
import { buildFakeAtcState } from './build-fake-atc-state.ts';
import type { FakeAtcState } from './build-fake-atc-state.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';

process.env['HQ_FETCH_RETRY_MS'] ??= '0';
process.env['HQ_REF_LOCK_RETRY_MS'] ??= '0';
process.env['HQ_SEARCH_GAP_MS'] ??= '0';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function freshDb(): { db: Database; dir: string; path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-test-'));
  const path = join(dir, 'hq.db');
  process.env['HQ_DB'] = path;
  const db = openDb(path);

  // A test database needs no crash safety, and an fsync per commit made a 62-run release test take 6-10 s under host load.
  db.exec('PRAGMA synchronous = OFF;');
  return { db, dir, path, cleanup: () => (db.close(), rmSync(dir, { recursive: true, force: true })) };
}

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
  pending: Map<string, { message?: string }>;
  sent: { session: string; text: string; from: string; idempotencyKey: string; notice?: boolean }[];
  onMessage: (() => void) | null;
  stop: () => void;
}

const SessionInputSchema = z.object({ session: z.string() });
const SentMessageSchema = z.object({ session: z.string(), text: z.string(), from: z.string(), idempotencyKey: z.string(), notice: z.boolean().optional() });

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

export interface FakeAtcSession {
  id: string;
  name: string;
  alive: boolean;
  state: string;
  agentSessionID?: string;
  pinned?: boolean;
  cwd?: string;
  createdAt?: number;
  agent?: string;
  locator?: { targetID: string };
}

export function fakeAtc(directory: string, sessions: FakeAtcSession[] = [
  { id: 'id-stu', name: 'z-stu', alive: true, state: 'done' },
  { id: 'id-refine', name: 'z-refine', alive: true, state: 'done' },
  { id: 'id-steward', name: 'z-steward', alive: true, state: 'done' },
  { id: 'id-delivery', name: 'z-delivery', alive: true, state: 'done' },
]): FakeAtc {
  const path = join(directory, 'atc.sock');
  const sent: FakeAtc['sent'] = [];
  const seen = new Map<string, string>();
  const feed: FeedEvent[] = [];
  const activity = new Map<string, number>();
  const pending = new Map<string, { message?: string }>();
  const fake: FakeAtc = { ...buildFakeAtcState(), path, sent, feed, activity, pending, onMessage: null, stop: () => {} };
  fake.stop = startStubAtcDaemon(path, {
    'session.list': () => ({ sessions }),
    'session.get': (input) => {
      const id = z.object({ session: z.string().optional() }).parse(input).session ?? '';
      const left = fake.getBudgets.get(id);
      if (left !== undefined) {
        if (left <= 0) {
          throw new ORPCError('internal', { message: 'invented session.get failure' });
        }
        fake.getBudgets.set(id, left - 1);
      }
      return { session: sessions.find((x) => x.id === id), prompt: fake.prompts.get(id) ?? null, lastActivityAt: activity.get(id) ?? 0, pending: pending.get(id) ?? null, result: null, sessionRecord: null };
    },
    'events.read': (input) => {
      // Like atc: no cursor reads the newest page.
      const args = z.object({ cursor: z.string().optional(), limit: z.number().optional() }).parse(input);
      const count = args.limit ?? 50;
      const first = args.cursor === undefined ? Math.max(0, feed.length - count) : readFeedStart(args.cursor);
      const last = Math.max(first, Math.min(feed.length, first + count));
      const page = feed.slice(first, last).map((event, offset) => Object.assign(structuredClone(event), { cursor: encodeCursor(first + offset + 1) }));
      return { events: page, cursor: encodeCursor(last), more: last < feed.length };
    },
    'session.spawn': (input) => {
      const id = `spawned-${sessions.length + 1}`;
      const raw = z.object({ name: z.string(), prompt: z.string() }).parse(input);
      sessions.push({ id, name: raw.name, alive: true, state: 'done' });
      fake.prompts.set(id, raw.prompt);
      fake.calls.push({ method: 'session.spawn', input });
      return { session: { id } };
    },
    'session.kill': (input) => {
      const found = sessions.find((x) => x.id === SessionInputSchema.parse(input).session);
      if (found) {
        Object.assign(found, { alive: false, state: 'exited' });
      }
      fake.calls.push({ method: 'session.kill', input });
      return { stopped: true };
    },
    'session.update': (input) => {
      const update = z.object({ session: z.string(), pinned: z.boolean().optional() }).parse(input);
      const found = sessions.find((x) => x.id === update.session);
      const pinned = update.pinned;
      const refused = pinned === true && fake.pinFailures.has(update.session);
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
      const id = SessionInputSchema.parse(input).session;
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
      const id = z.object({ message: z.string() }).parse(input).message;
      const message = sent[[...seen.values()].indexOf(id)];
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
      const raw = toExactOptional(SentMessageSchema.parse(input));
      if (!seen.has(raw.idempotencyKey)) {
        seen.set(raw.idempotencyKey, `m-${seen.size + 1}`);
        sent.push(raw);
        fake.onMessage?.();
      }
      return { message: seen.get(raw.idempotencyKey), status: 'queued' };
    },
  }).stop;
  process.env['HQ_ATC_SOCKET'] = path;
  return fake;
}

interface RepoFixture {
  dir: string;
  push: (files: Record<string, string>) => void;
}

export function runGit(cwd: string, ...args: string[]): void {
  const r = Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
}

// A clone whose every commit is on its remote and whose tree is clean, so the unpushed-work check
// finds nothing.
export function createPushedClone(directory: string, name: string): string {
  const remote = join(directory, `${name}-remote.git`);
  const clone = join(directory, name);
  runGit(directory, 'init', '-q', '--bare', '-b', 'main', remote);
  runGit(directory, 'clone', '-q', remote, clone);
  runGit(clone, 'commit', '-q', '--allow-empty', '-m', 'add kettle lid');
  runGit(clone, 'push', '-q', 'origin', 'main');
  return clone;
}

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

export function createHqDefsRepo(dir: string, files: Record<string, string>): { defs: string; push: (files: Record<string, string>) => void } {
  const repo = createOriginClone(dir, 'origin', 'defs', files);
  process.env['HQ_DEFINITIONS_DIR'] = repo.dir;
  return { defs: repo.dir, push: repo.push };
}

export function createDefsRepo(dir: string, files: Record<string, string>): { defs: string; private: string; push: (files: Record<string, string>) => void } {
  const hq = createHqDefsRepo(dir, { 'README.md': 'invented skills tree\n' });
  const hqPrivate = createOriginClone(dir, 'private-origin', 'private', files);
  process.env['HQ_PRIVATE_DIR'] = hqPrivate.dir;
  return { defs: hq.defs, private: hqPrivate.dir, push: hqPrivate.push };
}
