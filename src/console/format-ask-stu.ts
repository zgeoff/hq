import type { ConsoleItem } from '../load-console-items.ts';

// The text Ask Stu copies (GEO-1290): the owner pastes it to Stu to talk the item through.
export function formatAskStu(item: Pick<ConsoleItem, 'id' | 'title'>): string {
  return `hey stu, I want to chat about ${item.id} (${item.title})`;
}
