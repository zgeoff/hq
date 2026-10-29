import type { AtcMcpFiles } from '../src/health/types.ts';

interface StubAtcMcpFilesOptions {
  // what the PATH lookup for atc answers
  atc: string | null;
  files?: Record<string, string>;
  links?: Record<string, string>;
  mtimes?: Record<string, number>;

  // an errno code that every read of the path throws
  failures?: Record<string, string>;
}

// The atc mcp reader's files as tables by absolute path. A directory lists the names below it in
// any table, and a path in no table throws ENOENT; each error carries the code and the message node:fs gives.
export function buildStubAtcMcpFiles(options: StubAtcMcpFilesOptions): AtcMcpFiles {
  const files = options.files ?? {};
  const links = options.links ?? {};
  const mtimes = options.mtimes ?? {};
  const failures = options.failures ?? {};
  const answer = <T>(table: Record<string, T>, syscall: string, path: string): T => {
    const code = failures[path];
    if (code !== undefined) {
      throw buildErrnoError(code, syscall, path);
    }
    const value = table[path];
    if (value === undefined) {
      throw buildErrnoError('ENOENT', syscall, path);
    }
    return value;
  };
  return {
    readFile: (path) => answer(files, 'open', path),
    readlink: (path) => answer(links, 'readlink', path),
    mtimeMs: (path) => answer(mtimes, 'stat', path),
    readdir: (path) => {
      const code = failures[path];
      if (code !== undefined) {
        throw buildErrnoError(code, 'scandir', path);
      }
      const prefix = `${path}/`;
      const names = [...Object.keys(files), ...Object.keys(links), ...Object.keys(mtimes), ...Object.keys(failures)]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length).split('/')[0] ?? '');
      if (names.length === 0) {
        throw buildErrnoError('ENOENT', 'scandir', path);
      }
      return [...new Set(names)];
    },
    whichAtc: () => options.atc,
  };
}

const DESCRIPTIONS: Record<string, string> = {
  ENOENT: 'no such file or directory',
  EACCES: 'permission denied',
  ESRCH: 'no such process',
  EIO: 'i/o error',
};

function buildErrnoError(code: string, syscall: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${DESCRIPTIONS[code] ?? 'unknown error'}, ${syscall} '${path}'`), { code, syscall, path });
}
