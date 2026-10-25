import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { metaJson } from '../../db/meta-json.ts';
import { setMeta } from '../../db/set-meta.ts';
import { addNews } from '../../news/add-news.ts';
import { pickFleetNews } from './pick-fleet-news.ts';
import type { FleetView } from './types.ts';

const FINGERPRINT_KEY = 'fleet_forecast_fingerprint';
const FINGERPRINT = z.object({ pauseStart: z.string(), cap: z.number().nullable() }).nullable();

export function writeFleetNews(db: Database, view: FleetView): boolean {
  const effect = pickFleetNews(view, metaJson(db, FINGERPRINT_KEY, FINGERPRINT, null));

  return match(effect)
    .with({ kind: 'add-news' }, (add) => {
      addNews(db, { from: 'hq-capacity', topic: 'report', text: add.text, issue: null, link: null, needsGeoff: false });
      setMeta(db, FINGERPRINT_KEY, JSON.stringify(add.fingerprint));
      return true;
    })
    .with({ kind: 'clear-fingerprint' }, () => {
      setMeta(db, FINGERPRINT_KEY, null);
      return false;
    })
    .with({ kind: 'nothing' }, () => false)
    .exhaustive();
}
