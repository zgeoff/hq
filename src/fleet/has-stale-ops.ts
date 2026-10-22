import type { FleetClient, StaleOps } from './types.ts';

export function hasStaleOps(client: FleetClient): client is FleetClient & StaleOps {
  return Boolean(client.details && client.message && client.kill && client.unpin && client.forget);
}
