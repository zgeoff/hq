import { getLocalSettingsPath } from '../config/get-local-settings-path.ts';
import { LOCAL_KEYS } from '../config/local-keys.ts';
import { readLocalSettings } from '../config/read-local-settings.ts';
import type { Check } from './types.ts';

export function readLocalConfigCheck(env: Record<string, string | undefined> = process.env): Check {
  try {
    return checkSettings(env, readLocalSettings(env));
  } catch (error) {
    return { key: 'local-config', ok: false, line: `local settings: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function checkSettings(env: Record<string, string | undefined>, local: Record<string, string>): Check {
  const missing = LOCAL_KEYS.filter((key) => !(env[key] || local[key]));
  if (missing.length === 0) {
    return { key: 'local-config', ok: true, line: `local settings: all ${LOCAL_KEYS.length} set` };
  }
  return { key: 'local-config', ok: false, line: `local settings: ${missing.join(', ')} not set; put them in ${getLocalSettingsPath(env)} or the environment` };
}
