import type { ParsedRepo } from './parse-lower-repo.ts';

export function buildSlug(parsed: ParsedRepo): string {
  return `${parsed.owner}/${parsed.repo}`;
}
