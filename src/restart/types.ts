import type { WakeResult } from '../wake/types.ts';

export interface Settled {
  late: { id: string; name: string }[];
  down: { id: string; name: string; reason: string }[];
}

export interface RestartResult {
  log: string;
  dryRunCode: number;
  restartCode: number;
  settled: Settled | null;
  wake: WakeResult | { error: string };
}
