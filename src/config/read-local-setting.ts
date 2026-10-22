import { HqError } from '../errors.ts';
import { getLocalSettingsPath } from './get-local-settings-path.ts';
import type { LocalKey } from './local-keys.ts';
import { readLocalSettings } from './read-local-settings.ts';

// A machine-specific value: the environment wins over the local file. Other settings never read the file.
export function readLocalSetting(name: LocalKey, env: Record<string, string | undefined> = process.env): string {
  const value = env[name] || readLocalSettings(env)[name];
  if (value) {
    return value;
  }
  throw new HqError('bad_config', `${name} is not set: put it in ${getLocalSettingsPath(env)} or the environment`, { setting: name });
}
