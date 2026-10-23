import type { Runner } from '../runner/types.ts';
import { OWNER } from './owner.ts';
import type { Gate } from './parse-gate.ts';
import { parseGate } from './parse-gate.ts';
import { runGH } from './run-gh.ts';

// Read at main, so one read serves every PR of the pass with the paths the host builds from now.
export async function readGate(run: Runner, repo: string, name: string): Promise<Gate> {
  const content = await runGH(run, ['api', `repos/${OWNER}/${repo}/contents/.github/gates.yml?ref=main`, '--jq', '.content'], `gates of ${repo}`);
  return parseGate(content, name);
}
