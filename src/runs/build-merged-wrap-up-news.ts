import type { KeptSession, WrapUp } from './types.ts';

const NEWS_LIMIT = 400;

export function buildMergedWrapUpNews(issue: string, wrapUp: WrapUp): string | null {
  const items = [...wrapUp.kept.map((kept) => formatItem('kept', kept)), ...wrapUp.failed.map((failed) => formatItem('failed', failed))];
  if (items.length === 0) {
    return null;
  }
  const lead = `${issue} merged; wrap-up left`;
  let shown = items.length;
  while (shown > 0 && composeLine(lead, items, shown).length > NEWS_LIMIT) {
    shown -= 1;
  }
  return composeLine(lead, items, shown);
}

const ITEM_LIMIT = 160;

function formatItem(verdict: 'kept' | 'failed', session: KeptSession): string {
  const reason = session.reason.replaceAll(/\s+/gu, ' ').trim();
  const text = `${verdict} ${session.id.slice(0, 8)} (${reason})`;
  return text.length > ITEM_LIMIT ? `${text.slice(0, ITEM_LIMIT - 2)}…)` : text;
}

function composeLine(lead: string, items: string[], shown: number): string {
  const more = items.length - shown;
  const parts = [...items.slice(0, shown), ...(more > 0 ? [`and ${more} more`] : [])];
  return `${lead} ${parts.join('; ')}`;
}
