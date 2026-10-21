import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { hqSetenv } from '../runner/hq-setenv.ts';
import { createLogDir } from './create-log-dir.ts';
import { guardQuiet } from './guard-quiet.ts';
import { logPath } from './log-path.ts';
import { PATH } from './path.ts';
import { selfCommand } from './self-command.ts';

export async function launchDetached(run: Runner, opts: { force: boolean }): Promise<{ unit: string; log: string }> {
  guardQuiet(opts.force);
  const stamp = iso(now()).replace(/[-:]/g, '');
  const unit = `hq-restart-${stamp.toLowerCase()}`;
  const log = logPath(stamp);
  createLogDir(log);
  const r = await run(
    ['systemd-run', '--user', `--unit=${unit}`, '--collect', `--setenv=PATH=${PATH}`, ...hqSetenv({ HQ_RESTART_LOG: log }), ...selfCommand(), 'restart', '--here', '--force'],
    { env: cleanEnv() },
  );
  if (r.code !== 0) throw new HqError('launch_failed', `systemd-run failed (${r.code}): ${(r.stderr || r.stdout).trim()}`);
  return { unit, log };
}
