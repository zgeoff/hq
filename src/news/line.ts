import type { NewsItem } from './types.ts';

export function line(n: NewsItem): string {
  return `${n.text}${n.issue ? ` [${n.issue}]` : ''}${n.link ? ` ${n.link}` : ''}`;
}
