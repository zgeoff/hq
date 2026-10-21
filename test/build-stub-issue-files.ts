import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { IssueFiles } from '../src/linear/types.ts';

// The real filesystem, except that writing the page named `failing` writes half its text, as a
// full disk would, and then throws.
export function buildStubIssueFiles(failing: string): IssueFiles {
  return {
    statSync,
    readdirSync,
    rmSync,
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
