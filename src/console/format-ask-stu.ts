import type { ConsoleItem } from '../load-console-items.ts';

export function formatAskStu(item: Pick<ConsoleItem, 'id' | 'title'>): string {
  return `hey stu, I want to chat about ${item.id} (${item.title})`;
}
