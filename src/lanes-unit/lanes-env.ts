import { isClockOverride } from '../clock/is-clock-override.ts';
import { resolveUnitSetting } from '../fleet/resolve-unit-setting.ts';

// The local settings file sits under XDG_CONFIG_HOME, which the systemd manager may lack, so the unit
// carries it beside hq's own settings.
export function lanesEnv(home: string, processEnv: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = { PATH: `${home}/.local/bin:${home}/.bun/bin:/usr/local/bin:/usr/bin:/bin` };
  for (const [name, value] of Object.entries(processEnv)) {
    const resolved = resolveUnitSetting(name, value);
    if (((name.startsWith('HQ_') && !isClockOverride(name)) || name === 'XDG_CONFIG_HOME') && resolved !== undefined) {
      env[name] = resolved;
    }
  }
  env['HQ_AS'] = 'hq-lanes';
  return env;
}
