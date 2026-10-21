import type { PluginDrift, PromptDrift } from './types.ts';

// The text lines `hq fleet` adds: one per stale session (hint under it), one per unknown, one per
// session whose plugin folders differ from fleet.json's.
export function formatDriftLines(drift: Record<string, PromptDrift>, plugins: Record<string, PluginDrift> = {}): string[] {
  const lines: string[] = [];
  for (const [name, d] of Object.entries(drift)) {
    if (d.state === 'stale') {
      lines.push(`${name}: prompt stale since ${d.since ?? 'an unknown change'} — replace it as docs/sessions.md describes`);
      if (d.hint) lines.push(`  ${d.hint}`);
    } else if (d.state === 'unknown') lines.push(`${name}: prompt check unknown (${d.reason ?? 'no reason'})`);
  }
  for (const [name, p] of Object.entries(plugins)) {
    lines.push(`${name}: plugin folders differ: declared ${formatDirs(p.declared)}, running ${formatDirs(p.running)} — a respawn loads the declared ones`);
  }
  return lines;
}

function formatDirs(dirs: string[]): string {
  return dirs.length > 0 ? dirs.join(', ') : 'none';
}
