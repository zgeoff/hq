import type { PRRef } from './parse-pr-ref.ts';

// Whether a title names the PR as repo#n or owner/repo#n, not as part of a longer name or number.
export function hasPRName(title: string, ref: PRRef): boolean {
  const owner = ref.slug.split('/')[0] ?? '';
  const pattern = new RegExp(`(?<![\\w./-])(?:${RegExp.escape(owner)}/)?${RegExp.escape(ref.repo)}#${ref.pr}(?!\\d)`, 'iu');
  return pattern.test(title);
}
