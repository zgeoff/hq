import type { Stats } from 'node:fs';
import { lstatSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { BriefFiles, EntryKind } from './types.ts';

export function buildNodeBriefFiles(): BriefFiles {
  return {
    readKind: (path) => toEntryKind(statSync(path, { throwIfNoEntry: false })),
    readLinkKind: (path) => toEntryKind(lstatSync(path, { throwIfNoEntry: false })),
    readText: (path) => readFileSync(path, 'utf8'),
    writeText: (path, text) => writeFileSync(path, text),
  };
}

function toEntryKind(stats: Stats | undefined): EntryKind {
  if (stats === undefined) {
    return 'missing';
  }
  if (stats.isSymbolicLink()) {
    return 'link';
  }
  if (stats.isFile()) {
    return 'file';
  }
  return stats.isDirectory() ? 'directory' : 'other';
}
