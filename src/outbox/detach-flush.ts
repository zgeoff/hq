import { resolve } from 'node:path';
import { dbPath } from '../db/db-path.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import type { DetachResult } from './types.ts';

export async function detachFlush(run: Runner, self: string[], setenv: string[], retryFailed: boolean, ids?: number[]): Promise<DetachResult> {
  const path = `${process.env['HOME']}/.local/bin:${process.env['HOME']}/.bun/bin:/usr/local/bin:/usr/bin:/bin`,
    unit = `hq-send-${Date.now()}-${process.pid}`;
  // The unit starts in the manager's environment and directory: blank any session variables
  // it could inherit, and pin the database to an absolute path.
  const db = [`--setenv=HQ_DB=${resolve(dbPath())}`];
  const cmd = [
    'systemd-run', '--user', `--unit=${unit}`, '--collect', '--quiet',
    `--setenv=PATH=${path}`, '--setenv=ATC_SESSION_ID=', '--setenv=ATC_SESSION_RECORD=',
    ...setenv, ...db, ...self, 'outbox', 'flush', ...(retryFailed ? ['--retry'] : []), ...(ids ? ['--ids', ids.join(',')] : []),
  ];
  try {
    const r = await run(cmd, { env: cleanEnv() });
    return r.code === 0 ? { unit, error: null } : { unit: null, error: (r.stderr || r.stdout).trim() || `exit ${r.code}` };
  } catch (e) {
    return { unit: null, error: String((e as Error).message ?? e) };
  }
}
