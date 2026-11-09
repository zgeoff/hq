// oxlint-disable zgeoff/test-beside-module -- checks the command registry against the dispatcher in src/cli.ts and every group
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { GROUP_HANDLERS } from '../src/group-handlers.ts';
import { HELP } from '../src/help.ts';
import { VERSION } from '../src/version.ts';
import type { Command } from '../src/commands.ts';
import { COMMANDS } from '../src/commands.ts';
import { findCommand } from '../src/find-command.ts';
import { renderHelp } from '../src/render-help.ts';
import { findPath } from '../src/test-utils/find-path.ts';
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
  for (const command of COMMANDS) {
    for (const noun of command.nouns) {
      for (const verb of command.verbs ?? []) {
        expect(findCommand(noun, verb)).toBe(command);
      }
      if (command.bare || command.verbs === null) {
        expect(findCommand(noun, undefined)).toBe(command);
      }
      if (command.verbs === null) {
        expect(findCommand(noun, 'no-such-verb')).toBe(command);
      }
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
    expect(GROUP_HANDLERS.has(c.group), c.usage).toBe(true);
    expect(c.nouns.length).toBeGreaterThan(0);
    expect(c.usage.startsWith('hq ')).toBe(true);
    expect(c.summary.length).toBeGreaterThan(0);
    expect(typeof c.readOnly).toBe('boolean');
    expect(c.nouns.every((n) => c.usage.includes(n))).toBe(true);
  }
});

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
  const compared = [...body.matchAll(/(?:verb ===|verb !==) '(?<verb>[^']+)'/gu)].map((found) => found.groups?.['verb'] ?? '');
  const labelLists = [...body.matchAll(/\.with\((?<labels>(?:undefined|'[^']+')(?:, (?:undefined|'[^']+'))*), /gu)].map((found) => found.groups?.['labels'] ?? '');
  const matched = labelLists.flatMap((labels) => [...labels.matchAll(/'(?<verb>[^']+)'/gu)].map((label) => label.groups?.['verb'] ?? ''));
  const verbs = [...compared, ...matched];
  const bare = labelLists.some((labels) => labels.split(', ').includes('undefined'));
  return { verbs: [...new Set(verbs)], bare: bare || fn === 'outboxCommand' };
}

test('every verb a group function handles has a row, or a catch-all row covers it', () => {
  for (const [noun, fn] of Object.entries(FUNCTIONS)) {
    const { verbs, bare } = verbsOf(fn);
    expect(verbs.length, fn).toBeGreaterThan(0);
    for (const verb of verbs) {
      const command = findCommand(noun, verb);
      expect(command && (command.verbs === null || command.verbs.includes(verb)), `${noun} ${verb}`).toBe(true);
    }
    if (bare) {
      const command = findCommand(noun, undefined);
      expect(command && (command.bare || command.verbs === null), `${noun} with no verb`).toBe(true);
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
  expect(findCommand('status', undefined)?.readOnly).toBe(true);
  expect(findCommand('run', 'list')?.readOnly).toBe(true);
  expect(findCommand('call', 'list')?.readOnly).toBe(true);
  expect(findCommand('run', 'add')?.readOnly).toBe(false);
  expect(findCommand('hold', undefined)?.readOnly).toBe(false);
  expect(findCommand('outbox', 'flush')?.readOnly).toBe(false);
  expect(findCommand('stats', undefined)?.readOnly).toBe(false);
});

test('the dispatcher keeps its special cases and its errors', async () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  expect(await main(['help'])).toBe(0);
  expect(ctx.out.join('\n')).toBe(HELP);
  ctx.out.length = 0;
  expect(await main(['--help'])).toBe(0);
  expect(ctx.out.join('\n')).toBe(HELP);
  ctx.out.length = 0;
  expect(await main(['--version'])).toBe(0);
  expect(ctx.out.join('\n')).toContain(`hq ${VERSION} (schema v`);
  ctx.out.length = 0;
  expect(await main(['no-such-noun'])).toBe(1);
  expect(ctx.out.join('\n')).toBe('hq: unknown command: no-such-noun. Try hq help');
  ctx.out.length = 0;
  expect(await main(['run', 'no-such-verb'])).toBe(1);
  expect(ctx.out.join('\n')).toBe('hq: unknown command: hq run no-such-verb');
  ctx.out.length = 0;
  expect(await main(['call'])).toBe(1);
  expect(ctx.out.join('\n')).toBe('hq: --command is required');
  ctx.out.length = 0;
  expect(await main(['outbox', 'no-such-verb'])).toBe(0);
  expect(ctx.out.join('\n')).toBe('Outbox empty.');
});

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  updateEnv('HQ_NOTIFY', 'off');
  updateEnv('HQ_AS', 'z-stu');
  const out: string[] = [];
  const log = spyOn(console, 'log').mockImplementation((line: string) => out.push(line));
  onTestFinished(() => log.mockRestore());
  const error = spyOn(console, 'error').mockImplementation((line: string) => out.push(line));
  onTestFinished(() => error.mockRestore());

  return { out };
}

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
    expect(findPath(JSON.parse(text), 'ok')).toBe(true);
  } finally {
    done();
  }
});
