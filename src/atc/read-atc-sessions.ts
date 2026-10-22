import { AtcClient } from './atc-client.ts';
import type { SessionInfo } from './session-schema.ts';

// atc's session list, over a fresh connection that closes after the answer. atc down: throws.
export async function readAtcSessions(): Promise<SessionInfo[]> {
  const client = await AtcClient.open(undefined, 1500);
  try {
    return await client.sessions();
  } finally {
    client.close();
  }
}
