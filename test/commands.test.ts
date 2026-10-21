import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUPS, HELP, VERSION, main } from '../src/cli.ts';
import { COMMANDS, lookup, renderHelp, type Command } from '../src/commands.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

const root = join(import.meta.dir, '..');
const cliSource = readFileSync(join(root, 'src/cli.ts'), 'utf8');

test('HELP is byte-identical to the help text before the registry', () => {
  const before = readFileSync(join(import.meta.dir, 'fixtures/help-before.txt'), 'utf8').replace(/^hq \S+:/, `hq ${VERSION}:`);
  expect(HELP).toBe(before);
  expect(renderHelp(VERSION)).toBe(HELP);
});

test('--help is generated from the rows: a changed summary shows in the text', () => {
  const rows = COMMANDS.map((c) => (c.nouns[0] === 'pins' ? { ...c, summary: 'invented summary' } : c));
  expect(renderHelp(VERSION, rows)).toContain('  hq pins                                     invented summary\n');
  const hidden = COMMANDS.map((c) => (c.nouns[0] === 'pins' ? { ...c, help: false as const } : c));
  expect(renderHelp(VERSION, hidden)).not.toContain('hq pins');
});

test('every row resolves through the dispatcher lookup to itself', () => {
  for (const c of COMMANDS) {
    for (const noun of c.nouns) {
      for (const verb of c.verbs ?? []) expect(lookup(noun, verb)).toBe(c);
      if (c.bare || c.verbs === null) expect(lookup(noun, undefined)).toBe(c);
      if (c.verbs === null) expect(lookup(noun, 'no-such-verb')).toBe(c);
    }
  }
});

test('no two rows claim the same noun and verb', () => {
  const seen = new Map<string, Command>();
  const claim = (key: string, c: Command) => {
    expect(seen.has(key), `${key} is claimed twice`).toBe(false);
    seen.set(key, c);
  };
  for (const c of COMMANDS) {
    for (const noun of c.nouns) {
      for (const verb of c.verbs ?? []) claim(`${noun} ${verb}`, c);
      if (c.bare) claim(`${noun} (bare)`, c);
      if (c.verbs === null) claim(`${noun} (any)`, c);
    }
  }
});

test('every row names a group that exists and has the fields a capabilities listing needs', () => {
  for (const c of COMMANDS) {
    expect(GROUPS[c.group], c.usage).toBeDefined();
    expect(c.nouns.length).toBeGreaterThan(0);
    expect(c.usage.startsWith('hq ')).toBe(true);
    expect(c.summary.length).toBeGreaterThan(0);
    expect(typeof c.readOnly).toBe('boolean');
    expect(c.nouns.every((n) => c.usage.includes(n))).toBe(true);
  }
});

// Each noun's group function in cli.ts, and the verbs its source switches on.
const FUNCTIONS: Record<string, string> = {
  call: 'askCommand',
  proposal: 'askCommand',
  unblock: 'unblockCommand',
  run: 'runCommand',
  health: 'healthCommand',
  kinds: 'kindsCommand',
  goals: 'goalsCommand',
  typed: 'typedCommand',
  defs: 'defsCommand',
  morning: 'morningCommand',
  followup: 'followupCommand',
  mark: 'markCommand',
  fleet: 'fleetCommand',
  probe: 'probeCommand',
  backup: 'backupCommand',
  news: 'newsCommand',
  lanes: 'lanesCommand',
  wake: 'wakeCommand',
  outbox: 'outboxCommand',
  repair: 'repairCommand',
};

function verbsOf(fn: string): { verbs: string[]; bare: boolean } {
  const start = cliSource.search(new RegExp(`^(async )?function ${fn}\\(`, 'm'));
  expect(start, fn).toBeGreaterThanOrEqual(0);
  const end = cliSource.indexOf('\n}\n', start);
  const body = cliSource.slice(start, end);
  const verbs = [...body.matchAll(/(?:case|verb ===|verb !==) '([^']+)'/g)].map((m) => m[1]!);
  return { verbs: [...new Set(verbs)], bare: /case undefined:/.test(body) || fn === 'outboxCommand' };
}

test('every verb a group function handles has a row, or a catch-all row covers it', () => {
  for (const [noun, fn] of Object.entries(FUNCTIONS)) {
    const { verbs, bare } = verbsOf(fn);
    expect(verbs.length, fn).toBeGreaterThan(0);
    for (const verb of verbs) {
      const c = lookup(noun, verb);
      expect(c && (c.verbs === null || c.verbs.includes(verb)), `${noun} ${verb}`).toBe(true);
    }
    if (bare) {
      const c = lookup(noun, undefined);
      expect(c && (c.bare || c.verbs === null), `${noun} with no verb`).toBe(true);
    }
  }
});

test('every noun cli.ts used to dispatch has a row', () => {
  const nouns = new Set(COMMANDS.flatMap((c) => c.nouns));
  for (const n of ['status', 'wake', 'restart', 'repair', 'review', 'lanes', 'run', 'news', 'health', 'backup', 'fleet', 'probe', 'stats', 'kinds', 'goals', 'mark', 'typed', 'morning', 'defs', 'followup', 'pins', 'open', 'hold', 'release', 'call', 'proposal', 'unblock', 'outbox']) {
    expect(nouns.has(n), n).toBe(true);
  }
});

test('a read-only row is one that never writes: spot checks', () => {
  const ro = (noun: string, verb?: string) => lookup(noun, verb)!.readOnly;
  expect(ro('status')).toBe(true);
  expect(ro('run', 'list')).toBe(true);
  expect(ro('call', 'list')).toBe(true);
  expect(ro('run', 'add')).toBe(false);
  expect(ro('hold')).toBe(false);
  expect(ro('outbox', 'flush')).toBe(false);
  expect(ro('stats')).toBe(false);
});

let cleanup: () => void;
let out: string[];
const origLog = console.log;
const origErr = console.error;
beforeEach(() => {
  ({ cleanup } = freshDb());
  at(NOON_SYDNEY);
  process.env['HQ_NOTIFY'] = 'off';
  process.env['HQ_AS'] = 'z-stu';
  out = [];
  console.log = (s: string) => out.push(s);
  console.error = (s: string) => out.push(s);
});
afterEach(() => {
  console.log = origLog;
  console.error = origErr;
  cleanup();
});

test('the dispatcher keeps its special cases and its errors', async () => {
  expect(await main(['help'])).toBe(0);
  expect(out.join('\n')).toBe(HELP);
  out = [];
  expect(await main(['--help'])).toBe(0);
  expect(out.join('\n')).toBe(HELP);
  out = [];
  expect(await main(['--version'])).toBe(0);
  expect(out.join('\n')).toContain(`hq ${VERSION} (schema v`);
  out = [];
  expect(await main(['no-such-noun'])).toBe(1);
  expect(out.join('\n')).toBe('hq: unknown command: no-such-noun. Try hq help');
  out = [];
  expect(await main(['run', 'no-such-verb'])).toBe(1);
  expect(out.join('\n')).toBe('hq: unknown command: hq run no-such-verb');
  out = [];
  expect(await main(['call'])).toBe(1);
  expect(out.join('\n')).toBe('hq: --command is required');
  out = [];
  expect(await main(['outbox', 'no-such-verb'])).toBe(0);
  expect(out.join('\n')).toBe('Outbox empty.');
});

// The real entry point, not main() called from a test: a handler must not wait on the module that is running it.
test('hq run as the entry point answers a command', async () => {
  const { dir, cleanup: done } = freshDb();
  try {
    const env = { ...process.env, HQ_DB: join(dir, 'entry.db'), HQ_NOTIFY: 'off', HQ_AS: 'z-stu' };
    const p = Bun.spawn(['bun', join(root, 'src/cli.ts'), 'status', '--json'], { env, stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => p.kill(), 20_000);
    const text = await new Response(p.stdout).text();
    expect(await p.exited).toBe(0);
    clearTimeout(timer);
    expect(JSON.parse(text).ok).toBe(true);
  } finally {
    done();
  }
});
