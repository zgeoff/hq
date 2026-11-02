const SHOWN = 3;

export function formatItemList(items: readonly string[]): string {
  if (items.length === 0) {
    return '';
  }
  const more = items.length > SHOWN ? `; ${items.length - SHOWN} more` : '';
  return ` (${items.slice(0, SHOWN).join(', ')}${more})`;
}
