import type { ItemInput } from './parse-item-input.ts';

// The plain-text body an item filed as JSON keeps, so `hq call show` and every reader of `body`
// still see its content.
export function renderItemBody(item: ItemInput): string {
  const blocks: string[] = [];
  for (const d of item.details) {
    blocks.push([`## ${d.heading}`, d.text, ...(d.code === undefined ? [] : ['```', d.code, '```'])].join('\n'));
  }
  if (item.diff !== undefined) {
    blocks.push(`## Now\n${item.diff.now}\n\n## Would read\n${item.diff.would}`);
  }
  if (item.options !== undefined) {
    blocks.push(['## Options', ...item.options.map((o, i) => `${i + 1}. ${o.label}: ${o.effect}${o.recommended === true ? ' (Stu\'s pick)' : ''}`)].join('\n'));
  }
  return blocks.length > 0 ? blocks.join('\n\n') : item.question;
}
