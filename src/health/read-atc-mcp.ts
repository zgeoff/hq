import { join } from 'node:path';
import { isAtcMcpCommand } from './is-atc-mcp-command.ts';
import { parseAtcMcpProcess } from './parse-atc-mcp-process.ts';
import { parseBtime } from './parse-btime.ts';
import type { AtcMcpFiles, AtcMcpProcess, AtcMcpRead } from './types.ts';

// Every `atc mcp` process, plus the atc binary's modification time, or the error that stopped the read.
export function readAtcMcp(files: AtcMcpFiles): AtcMcpRead {
  const binaryPath = files.whichAtc();
  if (binaryPath === null) {
    return 'no atc on PATH';
  }
  try {
    const binary = { path: binaryPath, mtimeMs: files.mtimeMs(binaryPath) };
    const statPath = join(files.procRoot, 'stat');
    const btime = parseBtime(files.readFile(statPath));
    if (btime === null) {
      return `no btime in ${statPath}`;
    }
    const processes: AtcMcpProcess[] = [];
    for (const entry of files.readdir(files.procRoot)) {
      if (!/^\d+$/u.test(entry)) {
        continue;
      }
      const found = readProcess(files, Number(entry), btime);
      if (typeof found === 'string') {
        return found;
      }
      if (found) {
        processes.push(found);
      }
    }
    return { processes, binary };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// null: not an atc mcp process, or it exited mid-scan; a string: the error that stopped its read.
function readProcess(files: AtcMcpFiles, pid: number, btime: number): AtcMcpProcess | string | null {
  const directory = join(files.procRoot, String(pid));
  let path = join(directory, 'cmdline');
  try {
    const cmdline = files.readFile(path);

    // another user's process refuses its exe link, so only an atc mcp process gets the other reads.
    if (!isAtcMcpCommand(cmdline)) {
      return null;
    }
    path = join(directory, 'stat');
    const stat = files.readFile(path);
    path = join(directory, 'exe');
    const exe = files.readlink(path);
    path = join(directory, 'cgroup');
    const cgroup = files.readFile(path);
    const parsed = parseAtcMcpProcess({ pid, cmdline, stat, exe, cgroup, btime });
    return parsed === 'no start time' ? `no start time in ${join(directory, 'stat')}` : parsed;
  } catch (error) {
    return hasExited(error) ? null : `pid ${pid}: can't read ${path}: ${errorCode(error)}`;
  }
}

// ENOENT or ESRCH: the process exited between the directory listing and this read.
function hasExited(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ESRCH';
}

function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}
