import type { BriefPlaybook } from './types.ts';

// The owner keeps no Improvement playbook: an Improvement follows the feature one.
const PLAYBOOK_OF: Readonly<Record<string, string>> = { improvement: 'feature' };

// The playbook of an issue type: where it is in zgeoff/hq and the pinned command that prints it.
export function buildPlaybook(type: string, sha: string): BriefPlaybook {
  const name = PLAYBOOK_OF[type.toLowerCase()] ?? type.toLowerCase();
  const path = `agent-kit/playbooks/${name}.md`;
  return { type: name, path, command: `gh api 'repos/zgeoff/hq/contents/${path}?ref=${sha}' -H 'Accept: application/vnd.github.raw'` };
}
