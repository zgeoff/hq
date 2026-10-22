import { AtcClient } from '../atc/atc-client.ts';

// A daemon that just restarted may need a moment before its socket answers.
export async function connectWithRetry(waitMs: number): Promise<AtcClient> {
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      return await AtcClient.open();
    } catch (e) {
      if (Date.now() >= until) throw e;
      await Bun.sleep(1000);
    }
  }
}
