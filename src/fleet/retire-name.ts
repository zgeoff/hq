import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { strMap } from '../db/str-map.ts';
import { HqError } from '../errors.ts';
import { wakeList } from '../wake/wake-list.ts';
import { wakeRemove } from '../wake/wake-remove.ts';
import { loadDeclaredFleet as allDeclared } from './load-declared-fleet.ts';
import { retiredNames } from './retired-names.ts';

export function retireName(db: Database, name: string, actor: string, retire: boolean): { changed: boolean; wakeRemoved: number } {
  if (!allDeclared().some((e) => e.name === name)) throw new HqError('bad_args', `${name} is not a declared fleet name: ${allDeclared().map((e) => e.name).join(', ')}`);
  return db
    .transaction(() => {
      const cur = retiredNames(db);
      const changed = retire ? !cur.includes(name) : cur.includes(name);
      setMeta(db, 'fleet_retired', JSON.stringify(retire ? [...new Set([...cur, name])] : cur.filter((n) => n !== name)));
      let wakeRemoved = 0;
      if (retire) {
        for (const w of wakeList(db).filter((w) => w.name === name)) {
          wakeRemove(db, w.session_id, actor);
          wakeRemoved++;
        }
        const missing = metaJson(db, 'fleet_missing_since', strMap, {});
        delete missing[name];
        setMeta(db, 'fleet_missing_since', JSON.stringify(missing));
      }
      if (changed) logEvent(db, 'hq', 'fleet', retire ? 'retired' : 'restored', actor, null, null, { name, wakeRemoved });
      return { changed, wakeRemoved };
    })
    .immediate();
}
