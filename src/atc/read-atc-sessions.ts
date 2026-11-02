import { AtcClient } from './atc-client.ts';
import type { SessionInfo } from './session-schema.ts';

export async function readAtcSessions(): Promise<SessionInfo[]> {
  const client = await AtcClient.open(undefined, 1500);
  try {
    return await client.sessions();
  } finally {
    client.close();
  }
}
