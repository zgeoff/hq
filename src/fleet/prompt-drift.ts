import { statSync } from 'node:fs';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { readPrompt } from '../prompts/read-prompt.ts';
import { runMainFetch } from '../prompts/run-main-fetch.ts';
import { DRIFT_BUDGET_MS } from './drift-budget-ms.ts';
import type { DriftClient, FleetEntry, FleetSession, PromptDrift } from './types.ts';
import { toErrorMessage } from '../to-error-message.ts';

export async function promptDrift(client: DriftClient, entries: FleetEntry[], live: FleetSession[], known: Record<string, string> = {}, budgetMs = DRIFT_BUDGET_MS): Promise<Record<string, PromptDrift>> {
  const out: Record<string, PromptDrift> = {};
  const unknown = (reason: string): PromptDrift => ({ state: 'unknown', since: null, hint: null, reason });

  // The fetch blocks the event loop, so it runs before the timed calls start, and each prompt read
  // inside them uses its cached result.
  if (entries.some((e) => e.prompt.startsWith('main:'))) {
    runMainFetch(PRIVATE_TREE.dir(), true);
  }
  const deadline = Date.now() + budgetMs;
  const timedOut = Symbol('timed out');
  const withinBudget = <T,>(p: Promise<T>): Promise<T | typeof timedOut> => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<typeof timedOut>((r) => (t = setTimeout(() => r(timedOut), Math.max(0, deadline - Date.now()))));
    return Promise.race([p, late]).finally(() => clearTimeout(t));
  };
  await Promise.all(entries.map(async (e) => {
    const recorded = Object.hasOwn(known, e.name) ? live.find((s) => s.id === known[e.name] && s.alive) : undefined;
    const byName = live.filter((s) => s.alive && s.name === e.name);
    const session = recorded ?? (byName.length === 1 ? byName[0] : undefined);
    if (!session) {
      if (byName.length > 1) out[e.name] = unknown(`${byName.length} live sessions share the name`);
      return;
    }
    let atcPrompt: string | undefined;
    try {
      const got = await withinBudget(client.prompt(session.id));
      if (got === timedOut) {
        out[e.name] = unknown(`atc session.get took over ${budgetMs} ms`);
        return;
      }
      atcPrompt = got;
    } catch (err) {
      out[e.name] = unknown(`atc session.get failed: ${toErrorMessage(err).slice(0, 120)}`);
      return;
    }
    if (atcPrompt === undefined) {
      out[e.name] = unknown('atc gave no prompt for the session');
      return;
    }
    let wanted: string;
    try {
      wanted = readPrompt(e.prompt, true);
    } catch (err) {
      out[e.name] = unknown(`can't read the prompt hq would spawn with: ${toErrorMessage(err).slice(0, 160)}`);
      return;
    }
    const a = normalize(wanted);
    const b = normalize(atcPrompt);
    out[e.name] = a === b ? { state: 'current', since: null, hint: null, reason: null } : { state: 'stale', since: promptSince(e.prompt), hint: firstDifference(a, b), reason: null };
  }));
  return Object.fromEntries(entries.filter((e) => out[e.name]).map((e) => [e.name, out[e.name]!]));
}

const normalize = (t: string) => t.split('\n').map((l) => l.trimEnd()).join('\n').trim();
const cut = (l: string) => (l.length > 80 ? l.slice(0, 80) : l);

function firstDifference(main: string, session: string): string {
  const a = main.split('\n');
  const b = session.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    let c = 0;
    while (c < x.length && c < y.length && x[c] === y[c]) c++;
    const from = Math.max(0, c - 20);
    const part = (s: string, line: string | undefined) => (line === undefined ? '(no line)' : cut(`${from > 0 ? '…' : ''}${s.slice(from)}`));
    return `line ${i + 1}: main: ${part(x, a[i])} vs session: ${part(y, b[i])}`;
  }
  return '';
}

function promptSince(source: string): string | null {
  try {
    if (source.startsWith('main:')) {
      const r = Bun.spawnSync(['git', '-C', PRIVATE_TREE.dir(), 'log', '-1', '--format=%h %s', 'origin/main', '--', source.slice('main:'.length)], { timeout: 30_000 });
      const out = r.exitCode === 0 ? r.stdout.toString().trim() : '';
      return out || null;
    }
    return statSync(source).mtime.toISOString();
  } catch {
    return null;
  }
}
