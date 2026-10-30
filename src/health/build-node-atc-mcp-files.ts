import { readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import type { AtcMcpFiles } from './types.ts';

export function buildNodeAtcMcpFiles(procRoot = '/proc', whichAtc: () => string | null = () => Bun.which('atc')): AtcMcpFiles {
  return {
    procRoot,
    readFile: (path) => readFileSync(path, 'utf8'),
    readdir: (path) => readdirSync(path),
    readlink: (path) => readlinkSync(path),
    mtimeMs: (path) => statSync(path).mtimeMs,
    whichAtc,
  };
}
