import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { sessionGetSchema } from '../src/atc/session-get-schema.ts';
import { sessionListRequiredSchema } from '../src/atc/session-list-required-schema.ts';
import { formatDriftLines } from '../src/fleet/format-drift-lines.ts';
import { findPluginDrift } from '../src/fleet/find-plugin-drift.ts';
import { promptDrift } from '../src/fleet/prompt-drift.ts';
import type { DriftClient, FleetEntry, FleetSession } from '../src/fleet/types.ts';
import { resetFetchCache } from '../src/prompts/reset-fetch-cache.ts';
import { NOON_SYDNEY, at, createDefsRepo, freshDb, requireEnv } from './helpers.ts';

let dir: string;
let cleanup: () => void;
let fleet: FleetEntry[];
let push: (files: Record<string, string>) => void;
const KETTLE = 'skills/kettle/references/session-prompt.md';
const live: FleetSession[] = [
  { id: 'id-kettle', name: 'z-kettle', alive: true },
  { id: 'id-teapot', name: 'z-teapot', alive: true },
];

beforeEach(() => {
  ({ dir, cleanup } = freshDb());
  at(NOON_SYDNEY);
  mkdirSync(`${dir}/work`, { recursive: true });
  resetFetchCache();
  ({ push } = createDefsRepo(dir, { [KETTLE]: '# prompt\n\n```text\nYou are Kettle.\nBoil water when asked.\n```\n' }));
  writeFileSync(`${dir}/teapot-prompt.md`, 'You are Teapot.\nSteep the tea.\n');
  utimesSync(`${dir}/teapot-prompt.md`, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));
  fleet = [
    { name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true },
    { name: 'z-teapot', cwd: `${dir}/work`, model: 'opus', prompt: `${dir}/teapot-prompt.md`, wake: false },
  ];
});
afterEach(() => {
  delete process.env['HQ_DEFINITIONS_DIR'];
  cleanup();
});

const atc = (prompts: Record<string, string | undefined | Error>): DriftClient & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    prompt: async (id) => {
      calls.push(id);
      const p = prompts[id];
      if (p instanceof Error) throw p;
      return p;
    },
  };
};

test('the same text is current, also with trailing spaces and a final newline', async () => {
  const c = atc({ 'id-kettle': 'You are Kettle.   \nBoil water when asked.\n\n', 'id-teapot': 'You are Teapot.\nSteep the tea.' });
  const r = await promptDrift(c, fleet, live);
  expect(r['z-kettle']).toEqual({ state: 'current', since: null, hint: null, reason: null });
  expect(r['z-teapot']!.state).toBe('current');
});

test('a changed main prompt is stale, with the commit that changed it and the first differing line', async () => {
  push({ [KETTLE]: '# prompt\n\n```text\nYou are Kettle.\nBoil water only when asked, then switch off.\n```\n' });
  const c = atc({ 'id-kettle': 'You are Kettle.\nBoil water when asked.', 'id-teapot': 'You are Teapot.\nSteep the tea.' });
  const r = await promptDrift(c, fleet, live);
  const k = r['z-kettle']!;
  expect(k.state).toBe('stale');
  expect(k.since).toMatch(/^[0-9a-f]{7} invented change$/);
  expect(k.hint).toBe('line 2: main: Boil water only when asked, then switch off. vs session: Boil water when asked.');
  expect(k.reason).toBeNull();
});

test('a changed prompt file is stale since its mtime; a hint cuts each line to 80 characters', async () => {
  const long = 'x'.repeat(100);
  const c = atc({ 'id-kettle': 'You are Kettle.\nBoil water when asked.', 'id-teapot': `You are Teapot.\n${long}` });
  const t = (await promptDrift(c, fleet, live))['z-teapot']!;
  expect(t.state).toBe('stale');
  expect(t.since).toBe('2026-10-01T00:00:00.000Z');
  expect(t.hint).toBe(`line 2: main: Steep the tea. vs session: ${'x'.repeat(80)}`);
});

test('unknown when atc gives no prompt, session.get fails, or main cannot be read; never stale', async () => {
  const none = await promptDrift(atc({ 'id-kettle': undefined, 'id-teapot': 'You are Teapot.\nSteep the tea.' }), fleet, live);
  expect(none['z-kettle']).toMatchObject({ state: 'unknown', since: null, hint: null });
  expect(none['z-kettle']!.reason).toContain('no prompt');
  expect(none['z-teapot']!.state).toBe('current');

  const failed = await promptDrift(atc({ 'id-kettle': new Error('socket went away'), 'id-teapot': 'x' }), fleet, live);
  expect(failed['z-kettle']!.state).toBe('unknown');
  expect(failed['z-kettle']!.reason).toContain('socket went away');

  const broken = [{ ...fleet[0]!, prompt: 'main:skills/nothing/references/session-prompt.md' }];
  const gone = await promptDrift(atc({ 'id-kettle': 'You are Kettle.' }), broken, live);
  expect(gone['z-kettle']!.state).toBe('unknown');
  expect(gone['z-kettle']!.reason).toContain("can't read the prompt");
});

test('an entry with no live session gets no check and no atc call; the recorded id wins over the name', async () => {
  const c = atc({ 'id-kettle': 'You are Kettle.\nBoil water when asked.', 'id-moved': 'something else' });
  const sessions: FleetSession[] = [{ id: 'id-kettle', name: 'z-kettle', alive: true }, { id: 'id-teapot', name: 'z-teapot', alive: false }];
  const r = await promptDrift(c, fleet, sessions);
  expect(Object.keys(r)).toEqual(['z-kettle']);
  expect(c.calls).toEqual(['id-kettle']);
  const renamed = await promptDrift(c, fleet, [{ id: 'id-moved', name: 'kettle', alive: true }], { 'z-kettle': 'id-moved' });
  expect(renamed['z-kettle']!.state).toBe('stale');
});

test('the text says how to restart a stale session, shows its hint, and names the unknown ones', () => {
  const lines = formatDriftLines({
    'z-kettle': { state: 'stale', since: 'abc1234 trim the prompt', hint: 'main: a vs session: b', reason: null },
    'z-teapot': { state: 'unknown', since: null, hint: null, reason: 'atc gave no prompt for the session' },
    'z-pot': { state: 'current', since: null, hint: null, reason: null },
  });
  expect(lines).toEqual([
    'z-kettle: prompt stale since abc1234 trim the prompt — replace it as docs/sessions.md describes',
    '  main: a vs session: b',
    'z-teapot: prompt check unknown (atc gave no prompt for the session)',
  ]);
});

test('session.get answer with a null prompt still validates, and keeps lastActivityAt', () => {
  const r = sessionGetSchema.parse({ lastActivityAt: 123, prompt: null });
  expect(r.lastActivityAt).toBe(123);
  expect(r.prompt ?? undefined).toBeUndefined();
});

test('a failing fetch is one quick attempt: no retry delay, state unknown', async () => {
  process.env['HQ_FETCH_RETRY_MS'] = '8000';
  try {
    Bun.spawnSync(['git', '-C', requireEnv('HQ_PRIVATE_DIR'), 'remote', 'set-url', 'origin', `${dir}/no-such-remote`]);
    resetFetchCache();
    const t0 = Date.now();
    const r = await promptDrift(atc({ 'id-kettle': 'You are Kettle.', 'id-teapot': 'x' }), fleet, live);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r['z-kettle']!.state).toBe('unknown');
    expect(r['z-kettle']!.reason).toContain("can't read the prompt");
  } finally {
    process.env['HQ_FETCH_RETRY_MS'] = '0';
  }
});

test('slow session.get replies run together and are cut off at the budget as unknown', async () => {
  const many: FleetEntry[] = Array.from({ length: 7 }, (_, i) => ({ ...fleet[1]!, name: `z-pot${String.fromCharCode(97 + i)}` }));
  const sessions: FleetSession[] = many.map((e, i) => ({ id: `id-${i}`, name: e.name, alive: true }));
  const slow: DriftClient = { prompt: (id) => new Promise((r) => setTimeout(() => r('You are Teapot.\nSteep the tea.'), id === 'id-6' ? 5_000 : 300)) };
  const t0 = Date.now();
  const r = await promptDrift(slow, many, sessions, {}, 1_000);
  expect(Date.now() - t0).toBeLessThan(1_500); // seven 300 ms calls in parallel, one cut off at 1 s
  expect(Object.values(r).filter((d) => d.state === 'current').length).toBe(6);
  expect(r['z-potg']).toEqual({ state: 'unknown', since: null, hint: null, reason: 'atc session.get took over 1000 ms' });
  expect(Object.keys(r)).toEqual(many.map((e) => e.name)); // declared order
});

test('a hint on a long line starts a little before the first character that differs', async () => {
  const shared = 'Your domain is the kettle shed, with its invented shelves and spare lids, kept tidy at all times, ';
  writeFileSync(`${dir}/teapot-prompt.md`, `You are Teapot.\n${shared}and the old teapot.\n`);
  const c = atc({ 'id-kettle': 'You are Kettle.\nBoil water when asked.', 'id-teapot': `You are Teapot.\n${shared}and the new teapot.` });
  const t = (await promptDrift(c, fleet, live))['z-teapot']!;
  expect(t.hint).toBe('line 2: main: … all times, and the old teapot. vs session: … all times, and the new teapot.');
});

test("plugin folders: a live session whose folders differ from its entry's is reported, a match or a missing session is not", () => {
  // z-kettle was spawned before atc took plugin folders; z-cosy has no live session.
  const entries: FleetEntry[] = [
      { name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true, pluginDirs: ['~/plugins/kettle-band'] },
      { name: 'z-teapot', cwd: `${dir}/work`, model: 'opus', prompt: `${dir}/teapot-prompt.md`, wake: false },
      { name: 'z-cosy', cwd: `${dir}/work`, model: 'opus', prompt: `${dir}/teapot-prompt.md`, wake: false, pluginDirs: ['~/plugins/cosy'] },
    ],
    found = findPluginDrift(entries, [
      { id: 'id-kettle', name: 'z-kettle', alive: true },
      { id: 'id-teapot', name: 'z-teapot', alive: true, pluginDirs: ['~/plugins/stray'] },
    ]);
  expect(found).toEqual({
    'z-kettle': { declared: ['~/plugins/kettle-band'], running: [] },
    'z-teapot': { declared: [], running: ['~/plugins/stray'] },
  });
  expect(formatDriftLines({}, found)).toEqual([
    'z-kettle: plugin folders differ: declared ~/plugins/kettle-band, running none — a respawn loads the declared ones',
    'z-teapot: plugin folders differ: declared none, running ~/plugins/stray — a respawn loads the declared ones',
  ]);
  expect(
    findPluginDrift(entries, [
      { id: 'id-k2', name: 'z-kettle', alive: true, pluginDirs: ['~/plugins/kettle-band'] },
      { id: 'id-teapot', name: 'z-teapot', alive: true },
    ]),
  ).toEqual({});
});

test('plugin folders: the recorded id wins over a second live session of the name; two by name and no record give no verdict', () => {
  const entries: FleetEntry[] = [{ name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true, pluginDirs: ['~/plugins/kettle-band'] }],
    sessions: FleetSession[] = [
      { id: 'id-old', name: 'z-kettle', alive: true },
      { id: 'id-new', name: 'z-kettle', alive: true, pluginDirs: ['~/plugins/kettle-band'] },
    ];
  expect(findPluginDrift(entries, sessions, { 'z-kettle': 'id-new' })).toEqual({});
  expect(findPluginDrift(entries, sessions, { 'z-kettle': 'id-old' })).toEqual({ 'z-kettle': { declared: ['~/plugins/kettle-band'], running: [] } });
  expect(findPluginDrift(entries, sessions)).toEqual({});
});

test("atc's session list keeps a session's plugin folders and drops a malformed list", () => {
  const bad = sessionListRequiredSchema.parse({ sessions: [{ id: 'a', name: 'z-kettle', alive: true, state: 'running', pluginDirs: 'nope' }] }),
    good = sessionListRequiredSchema.parse({ sessions: [{ id: 'a', name: 'z-kettle', alive: true, state: 'running', pluginDirs: ['~/p'] }] });
  expect(good.sessions).toEqual([expect.objectContaining({ pluginDirs: ['~/p'] })]);
  expect(bad.sessions).toEqual([expect.objectContaining({ pluginDirs: undefined })]);
});

test('plugin folders: a ~/ folder matches the expanded, resolved path atc lists, under HOME only', () => {
  const entries: FleetEntry[] = [{ name: 'z-kettle', cwd: `${dir}/work`, model: 'opus', prompt: `main:${KETTLE}`, wake: true, pluginDirs: ['~/plugins/kettle-band'] }],
    home = requireEnv('HOME');
  expect(findPluginDrift(entries, [{ id: 'id-kettle', name: 'z-kettle', alive: true, pluginDirs: [`${home}/plugins/kettle-band`] }])).toEqual({});
  expect(findPluginDrift(entries, [{ id: 'id-kettle', name: 'z-kettle', alive: true, pluginDirs: [`${home}/plugins/./kettle-band/`] }])).toEqual({});
  expect(findPluginDrift(entries, [{ id: 'id-kettle', name: 'z-kettle', alive: true, pluginDirs: ['/elsewhere/plugins/kettle-band'] }])).toEqual({
    'z-kettle': { declared: ['~/plugins/kettle-band'], running: ['/elsewhere/plugins/kettle-band'] },
  });
});
