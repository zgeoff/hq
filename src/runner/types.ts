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
}

export type Runner = (cmd: string[], opts?: RunOpts) => Promise<RunResult>;
