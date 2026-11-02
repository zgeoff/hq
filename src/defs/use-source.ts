import type { Database } from 'bun:sqlite';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { defsSourceFile } from '../prompts/defs-source-file.ts';
import type { DefsSource } from '../prompts/defs-sources.ts';
import { DEFS_SOURCES } from '../prompts/defs-sources.ts';
import { rawDefsSource } from '../prompts/raw-defs-source.ts';
import { preflight } from './preflight.ts';
import type { Check } from './types.ts';

export function useSource(db: Database, source: DefsSource, actor: string): { from: string; to: DefsSource; checks: Check[] } {
  const raw = rawDefsSource();
  const from = raw === null ? 'none' : raw.slice(0, 40);
  const checks = preflight(source);
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) throw new HqError('not_ready', `${source} is not ready; nothing changed:\n${bad.map((c) => `  ✗ ${c.line}`).join('\n')}`);
  const f = defsSourceFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(`${f}.tmp`, `${source}\n`);
  renameSync(`${f}.tmp`, f);
  logEvent(db, 'hq', 'defs', 'source', actor, from, source, { dir: DEFS_SOURCES[source].dir() });
  return { from, to: source, checks };
}
