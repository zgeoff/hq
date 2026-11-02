import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { IssueFiles } from '../src/linear/types.ts';

export function buildStubIssueFiles(failing: string, stuck = ''): IssueFiles {
  return {
    statSync,
    readdirSync,
    rmSync: (path, options) => {
      if (basename(path) === stuck) {
        throw new Error(`EIO: i/o error, unlink '${path}'`);
      }
      rmSync(path, options);
    },
    writeFileSync: (path, text) => {
      if (basename(path) !== failing) {
        writeFileSync(path, text);
        return;
      }
      writeFileSync(path, text.slice(0, Math.floor(text.length / 2)));
      throw new Error(`ENOSPC: no space left on device, write '${path}'`);
    },
  };
}
