import type { BriefPlaybook } from './types.ts';

// The playbook of an issue type: where it is in zgeoff/hq and the pinned command that prints it.
export function buildPlaybook(type: string, sha: string): BriefPlaybook {
  const path = `agent-kit/playbooks/${type.toLowerCase()}.md`;
  return { type: type.toLowerCase(), path, command: `gh api 'repos/zgeoff/hq/contents/${path}?ref=${sha}' -H 'Accept: application/vnd.github.raw'` };
}
