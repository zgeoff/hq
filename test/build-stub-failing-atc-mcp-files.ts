import type { AtcMcpFiles } from '../src/health/types.ts';

const DESCRIPTIONS: Record<string, string> = {
  ESRCH: 'no such process',
  EIO: 'i/o error',
};

// A real filesystem cannot raise ESRCH or EIO on demand, so this wraps real files and throws the given
// errno code, with the code and message node:fs gives, for each listed path; every other read passes through.
export function buildStubFailingAtcMcpFiles(files: AtcMcpFiles, failures: Record<string, string>): AtcMcpFiles {
  const failFor = (syscall: string, path: string) => {
    const code = failures[path];
    if (code !== undefined) {
      throw Object.assign(new Error(`${code}: ${DESCRIPTIONS[code] ?? 'unknown error'}, ${syscall} '${path}'`), { code, syscall, path });
    }
  };
  return {
    ...files,
    readFile: (path) => {
      failFor('open', path);
      return files.readFile(path);
    },
    readdir: (path) => {
      failFor('scandir', path);
      return files.readdir(path);
    },
    readlink: (path) => {
      failFor('readlink', path);
      return files.readlink(path);
    },
    mtimeMs: (path) => {
      failFor('stat', path);
      return files.mtimeMs(path);
    },
  };
}
