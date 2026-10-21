import { config } from '../config/config.ts';
import { credentialNames } from './credential-names.ts';
import { FETCH_STATE } from './fetch-state.ts';

// Fetch origin's main in a checkout at most once a minute per process, per checkout. A failed fetch
// is a refusal: an older origin/main could hold a prompt that main has since changed. `quick` is one
// attempt cut off after 10s, so a slow remote cannot hold a hook that runs `hq fleet --json`.
export function runMainFetch(dir: string, quick = false): string | null {
  const last = FETCH_STATE.get(dir);
  if (last && Date.now() - last.at < 60_000) {
    return last.error;
  }
  return writeFetchState(dir, quick);
}

function writeFetchState(dir: string, quick: boolean): string | null {
  const error = runRetriedFetch(dir, quick);
  FETCH_STATE.set(dir, { at: Date.now(), error });
  return error;
}

function runFetch(dir: string, quick: boolean): Bun.SyncSubprocess<'pipe', 'pipe'> {
  // An explicit refspec: a clone whose configured refspec skips main would leave origin/main old.
  // A dry run fetches too; that moves only origin/main, never the working tree or an hq file.
  return Bun.spawnSync(['git', '-C', dir, 'fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: quick ? 10_000 : 30_000,
  });
}

function runRetriedFetch(dir: string, quick: boolean): string | null {
  let result = runFetch(dir, quick);

  // One retry: a fetch refused once at a restart (2026-10-16) worked before and after.
  if (result.exitCode !== 0 && !quick) {
    Bun.sleepSync(config().HQ_FETCH_RETRY_MS);
    result = runFetch(dir, quick);
  }
  if (result.exitCode === 0) {
    return null;
  }
  const failure = result.exitCode === null ? `timed out after ${quick ? 10 : 30}s` : `failed${quick ? '' : ' twice'} (${result.exitCode})`;
  return `git fetch ${failure}: ${result.stderr.toString().trim().slice(0, 200)} [${credentialNames()}]`;
}
