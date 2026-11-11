import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { FLEET_MODEL_KEY } from './fleet-model-schema.ts';
import type { FleetModel } from './types.ts';

export interface FleetModelChange {
  model: string;
  actor: string;
  at: Date;
}

export function writeFleetModel(db: Database, change: FleetModelChange): FleetModel {
  const stored = { model: change.model, setAt: iso(change.at), setBy: change.actor };
  db.transaction(() => {
    setMeta(db, FLEET_MODEL_KEY, JSON.stringify(stored));
    logEvent(db, 'hq', 'model', 'model-set', change.actor, null, null, { model: change.model });
    addNews(db, {
      from: change.actor,
      topic: 'other',
      text: `Fleet model set: ${change.model}. Each session spawn and builder launch uses it from now; running sessions keep their model until they restart.`,
      issue: null,
      link: null,
      needsGeoff: false,
      tag: 'fleet-model',
    });
  }).immediate();
  return { ...stored, source: 'set' };
}
