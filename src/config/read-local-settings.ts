import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { getLocalSettingsPath } from './get-local-settings-path.ts';
import { LOCAL_KEYS } from './local-keys.ts';

const FlatStrings = z.record(z.string(), z.string()),
  cache = new Map<string, { mtimeMs: number; values: Record<string, string> }>();

export function readLocalSettings(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const path = getLocalSettingsPath(env);
  return loadIfPresent(path, readModifiedTime(path));
}

function loadIfPresent(path: string, mtimeMs: number | null): Record<string, string> {
  return mtimeMs === null ? {} : load(path, mtimeMs);
}

// Null for a file that is not there; any other failure to stat it is a bad_config naming the cause.
function readModifiedTime(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw new HqError('bad_config', `${path} cannot be read: ${(error as Error).message}`, { setting: 'HQ_LOCAL_CONFIG' });
  }
}

function load(path: string, mtimeMs: number): Record<string, string> {
  const hit = cache.get(path);
  return hit?.mtimeMs === mtimeMs ? hit.values : refresh(path, mtimeMs);
}

function refresh(path: string, mtimeMs: number): Record<string, string> {
  const entry = { mtimeMs, values: parseLocalSettings(path) };
  cache.set(path, entry);
  return entry.values;
}

function parseLocalSettings(path: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new HqError('bad_config', `${path} is not valid JSON; it must be a flat object of strings`, { setting: 'HQ_LOCAL_CONFIG' });
  }
  const parsed = FlatStrings.safeParse(raw);
  if (!parsed.success) {
    throw new HqError('bad_config', `${path} must be a flat JSON object of strings`, { setting: 'HQ_LOCAL_CONFIG' });
  }
  return Object.fromEntries(LOCAL_KEYS.flatMap((key) => (parsed.data[key] === undefined ? [] : [[key, parsed.data[key]]])));
}
