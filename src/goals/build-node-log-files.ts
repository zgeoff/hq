import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { LogFiles } from './types.ts';

export function buildNodeLogFiles(): LogFiles {
  return {
    listNames: (directory) => readdirSync(directory),
    probeExists: (path) => existsSync(path),
    readText: (path) => readFileSync(path, 'utf8'),
  };
}
