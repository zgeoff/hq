import type { ReviewAdapter } from './parse-review-adapter.ts';

// noslop runs claude with no --model unless a lens names one, and with no settings files, so
// Claude Code's own default model would review. The owner chose Opus for those reviews.
export function buildAdapterEnv(adapter: ReviewAdapter | undefined): Record<string, string> {
  return adapter === 'claude' ? { ANTHROPIC_MODEL: 'opus' } : {};
}
