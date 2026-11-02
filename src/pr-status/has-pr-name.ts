import type { PRRef } from './parse-pr-ref.ts';

export function hasPRName(title: string, ref: PRRef): boolean {
  const owner = ref.slug.split('/')[0] ?? '';
  const pattern = new RegExp(`(?<![\\w./-])(?:${RegExp.escape(owner)}/)?${RegExp.escape(ref.repo)}#${ref.pr}(?!\\d)`, 'iu');
  return pattern.test(title);
}
