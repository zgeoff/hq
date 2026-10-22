import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { BLOB } from './blob.ts';
import { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import { capacitySettings } from './capacity-settings.ts';
import type { CapacitySettings } from './types.ts';

export function setCapacitySetting(db: Database, key: string, value: string | null, actor: string): CapacitySettings {
  if (!(key in CAPACITY_DEFAULTS)) throw new HqError('bad_args', `unknown setting ${key}: one of ${Object.keys(CAPACITY_DEFAULTS).join(', ')}`);
  return db
    .transaction((): CapacitySettings => {
      const cur = metaJson(db, 'capacity_settings', BLOB, {});
      if (value === null) delete cur[key];
      else {
        const n = Number(value);
        if (value.trim() === '' || !Number.isFinite(n) || n < 0) throw new HqError('bad_args', `${key} must be a number, 0 or more`);
        requireImpVcpus(key, n);
        cur[key] = n;
      }
      setMeta(db, 'capacity_settings', JSON.stringify(cur));
      logEvent(db, 'hq', 'capacity', 'setting', actor, null, null, { key, value });
      return capacitySettings(db);
    })
    .immediate();
}

// One more imp's vCPUs divide the room under the vCPU line, so 0 would leave that line unchecked.
function requireImpVcpus(key: string, vcpus: number): void {
  if (key === 'impVcpus' && vcpus === 0) {
    throw new HqError('bad_args', 'impVcpus must be more than 0');
  }
}
