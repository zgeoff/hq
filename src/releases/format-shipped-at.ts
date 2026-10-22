export function formatShippedAt(tag: string | null): string {
  return tag ? `in ${tag}` : 'at merge';
}
