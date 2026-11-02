export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOpts {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdoutFile?: string;

  stdin?: string;
  timeoutMs?: number;

  signal?: AbortSignal;

  killGraceMs?: number;

  settleMs?: number;
}

export type Runner = (cmd: string[], opts?: RunOpts) => Promise<RunResult>;
