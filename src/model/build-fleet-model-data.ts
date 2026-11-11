import type { FleetModel } from './types.ts';

export interface FleetModelData {
  model: string;
  source: 'default' | 'set';
  setAt: string | null;
  setBy: string | null;
}

export function buildFleetModelData(fleetModel: FleetModel): FleetModelData {
  return fleetModel.source === 'default' ? { model: fleetModel.model, source: 'default', setAt: null, setBy: null } : { model: fleetModel.model, source: 'set', setAt: fleetModel.setAt, setBy: fleetModel.setBy };
}
