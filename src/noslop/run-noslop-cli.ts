import type { RunResult } from '../runner/types.ts';
import { recordOpRead } from '../one-password/record-op-read.ts';
import { checkout } from '../review/checkout.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { buildNoslopCommand } from './build-noslop-command.ts';
import { buildNoslopEnv } from './build-noslop-env.ts';
import { buildRunDir } from './build-run-dir.ts';
import { buildSlug } from './build-slug.ts';
import { getTail } from './get-tail.ts';
import { loadNoslopSecrets } from './load-noslop-secrets.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import type { PRRequest } from './types.ts';

export interface NoslopCliRun {
  finished: RunResult;

  // The end of stderr with the App's secrets cut out.
  tail: string;
}

// One noslop command for a PR, run from the pinned clone with the App's credentials, in a checkout
// of the PR's repo. The caller reads the exit code and the output.
export async function runNoslopCli(request: PRRequest, parsed: ParsedRepo, args: string[], timeoutMs: number): Promise<NoslopCliRun> {
  const sha = requirePinned(loadNoslopSettings(request.db).sha);
  const slug = buildSlug(parsed);
  const directory = await checkout(request.run, slug, parsed.repo, request.repoDir);
  const secrets = await loadNoslopSecrets(request.run, () => recordOpRead(request.db, 'noslop', 1));
  const clone = buildRunDir(resolveNoslopDir(), sha);
  const finished = await boundedRunner(request.run, timeoutMs)(buildNoslopCommand(clone, args), { cwd: directory, env: buildNoslopEnv(secrets) });
  return { finished, tail: getTail(finished.stderr, secrets) };
}
