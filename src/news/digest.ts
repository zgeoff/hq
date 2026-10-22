import { line } from './line.ts';
import { NEWS_TOPICS } from './news-topics.ts';
import type { NewsItem } from './types.ts';

export function digest(items: NewsItem[], opts: { all?: boolean; more?: number } = {}): string {
  if (!items.length) return opts.all ? 'No news yet.' : 'No unread news.';
  const out: string[] = [];
  for (const topic of NEWS_TOPICS) {
    const group = items.filter((n) => n.topic === topic);
    if (!group.length) continue;
    out.push(`${topic}:`);
    for (const item of group) {
      out.push(`  ${item.id}${item.needs_geoff ? ' (needs the owner)' : ''}${item.tag ? ` #${item.tag}` : ''} ${item.from_name}: ${line(item)}${item.read_at ? ' (read)' : ''}`);
    }
  }
  if (!opts.all) {
    const last = Math.max(...items.map((n) => n.id));
    out.push(`(hq news read --upto ${last} marks these read${opts.more ? `; ${opts.more} more unread after them` : ''})`);
  }
  return out.join('\n');
}
