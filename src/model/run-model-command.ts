import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { buildFleetModelData } from './build-fleet-model-data.ts';
import { formatFleetModel } from './format-fleet-model.ts';
import { parseModelName } from './parse-model-name.ts';
import { readFleetModel } from './read-fleet-model.ts';
import { writeFleetModel } from './write-fleet-model.ts';

export interface ModelCommandDeps {
  db: Database;
  actor: string;
  at: Date;
  verb: string | undefined;
  rest: readonly string[];
}

interface ModelOut {
  data: Record<string, unknown>;
  text: string;
}

export function runModelCommand(deps: ModelCommandDeps): ModelOut {
  return match(deps.verb ?? 'show')
    .with('show', () => {
      if (deps.rest.length > 0) {
        throw new HqError('bad_args', 'usage: hq model [show]');
      }
      const fleetModel = readFleetModel(deps.db);
      return { data: { ...buildFleetModelData(fleetModel) }, text: formatFleetModel(fleetModel) };
    })
    .with('set', () => {
      const model = parseModelName(deps.rest);
      const fleetModel = writeFleetModel(deps.db, { model, actor: deps.actor, at: deps.at });
      return { data: { ...buildFleetModelData(fleetModel) }, text: `Each session spawn and builder launch uses this from now; running sessions keep their model until they restart.\n${formatFleetModel(fleetModel)}` };
    })
    .otherwise((verb) => {
      throw new HqError('bad_args', `unknown command: hq model ${verb}`);
    });
}
