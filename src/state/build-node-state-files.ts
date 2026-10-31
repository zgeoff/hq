import { appendFileSync, chmodSync, constants, copyFileSync, existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { StateFiles } from './types.ts';

export function buildNodeStateFiles(): StateFiles {
  return {
    readText: (path) => readFileSync(path, 'utf8'),
    probeExists: (path) => existsSync(path),
    readMode: (path) => statSync(path).mode & 0o777,
    copyNew: (from, to) => copyFileSync(from, to, constants.COPYFILE_EXCL),
    appendText: (path, text, mode) => appendFileSync(path, text, { mode }),
    changeMode: (path, mode) => chmodSync(path, mode),
    writeText: (path, text, mode) => writeFileSync(path, text, { mode }),
    renameFile: (from, to) => renameSync(from, to),
    removeFile: (path) => rmSync(path, { force: true }),
  };
}
