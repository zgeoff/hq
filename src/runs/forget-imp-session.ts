import type { FleetClient, StaleOps } from '../fleet/types.ts';

// A separate stop before forgetting the live session would suspend a cloud imp, which outlasts the
// atc call. A failure throws; destroyed says whether atc confirmed a destroy of the imp.
export async function forgetImpSession(client: FleetClient & StaleOps, id: string): Promise<{ destroyed: boolean }> {
  const first = await client.forgetLive(id);
  if (first.confirmToken === undefined) {
    if (!first.forgotten) {
      throw new Error('atc did not forget the session');
    }
    return { destroyed: false };
  }
  const confirmed = await client.forgetLive(id, first.confirmToken);
  if (!confirmed.forgotten) {
    throw new Error('atc did not forget the session after the confirmed destroy');
  }
  return { destroyed: true };
}
