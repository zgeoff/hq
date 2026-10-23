import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { PATH_SETTINGS } from '../config/path-settings.ts';
import { HqError } from '../errors.ts';
import { resolveUnitSetting } from '../fleet/resolve-unit-setting.ts';
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
    ['systemd-run', '--user', `--unit=${unit}`, '--collect', `--setenv=PATH=${PATH}`, ...hqSetenv({ ...readPathOverrides(), HQ_RESTART_LOG: log }), ...selfCommand(), 'restart', '--here', '--force'],
    { env: cleanEnv() },
  );
  if (r.code !== 0) throw new HqError('launch_failed', `systemd-run failed (${r.code}): ${(r.stderr || r.stdout).trim()}`);
  return { unit, log };
}

// The detached unit runs from another directory, so each relative path setting is made absolute
// here, where it was meant.
function readPathOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const name of PATH_SETTINGS.keys()) {
    const resolved = resolveUnitSetting(name, process.env[name]);
    if (resolved !== undefined) {
      overrides[name] = resolved;
    }
  }
  return overrides;
}
