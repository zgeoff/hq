// Runs external commands (atc, git, gh, codex). Tests pass a fake.
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOpts {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdoutFile?: string;

  // Text written to the command's standard input; none when absent.
  stdin?: string;
  timeoutMs?: number; // kill the command after this long; it then exits 124, like timeout(1)

  // Aborting it kills the command; an already aborted signal starts no command and throws.
  signal?: AbortSignal;

  // After the deadline's TERM, how long before the KILL; 2 s when absent.
  killGraceMs?: number;

  // How long a timed command's output may trail its exit; 1 s, or 0.5 s once timed out, when absent.
  settleMs?: number;
}

export type Runner = (cmd: string[], opts?: RunOpts) => Promise<RunResult>;
