import { config } from '../config/config.ts';

// Where hq puts the loop text it took from the repo. hq writes it; no session has to.
export function repoLoopPromptPath(): string {
  return config().HQ_REPO_LOOP_PROMPT ?? `${process.env['HOME']}/.local/share/z-sessions/hq-delivery-loop-prompt.md`;
}
