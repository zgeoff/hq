import { HqError } from '../errors.ts';
import { reviewDir } from '../review/review-dir.ts';
import type { Runner } from '../runner/types.ts';
import { readNoslopProcesses } from './read-noslop-processes.ts';
import type { NoslopProcess } from './read-noslop-processes.ts';
import { readOpenRounds } from './read-open-rounds.ts';
import type { OpenRound } from './read-open-rounds.ts';

// Refuses while a noslop CLI runs from hq's clones or a review round is open: a pin that migrates
// the store under a running review can lose that review's record.
export async function requireNoslopIdle(run: Runner): Promise<void> {
  const processes = await readNoslopProcesses(run),
    rounds = readOpenRounds(reviewDir());
  if (processes.length === 0 && rounds.length === 0) {
    return;
  }
  throw new HqError('noslop_busy', formatBusy(processes, rounds), { processes, rounds });
}

function formatBusy(processes: NoslopProcess[], rounds: OpenRound[]): string {
  const lines = [
    ...processes.map((found) => `  process ${found.pid}: ${found.command}`),
    ...rounds.map((found) => `  round ${found.ref} (review process ${found.pid}), started ${found.startedAt}`),
  ];
  return `noslop is running:\n${lines.join('\n')}\nWait for it to end, or pass --force <reason>.`;
}
