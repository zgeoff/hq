import type { FleetModel } from './types.ts';

export function formatFleetModel(fleetModel: FleetModel): string {
  return fleetModel.source === 'default' ? `Fleet model: ${fleetModel.model} (default)` : `Fleet model: ${fleetModel.model} (set ${fleetModel.setAt} by ${fleetModel.setBy})`;
}
