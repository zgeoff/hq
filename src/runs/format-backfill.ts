import type { BackfillResult } from './run-note-backfill.ts';

export function formatBackfill(backfill: BackfillResult | undefined): string {
  if (backfill === undefined) {
    return '';
  }
  if (backfill.kind === 'unread') {
    return `\nCould not read the session's earlier notes from atc (${backfill.reason}); notes sent before it joined are not recorded.`;
  }
  return backfill.notes > 0 ? `\nRecorded ${backfill.notes} earlier note${backfill.notes === 1 ? '' : 's'} from the session${backfill.finals.length > 0 ? `, final: ${backfill.finals.join(', ')}` : ''}.` : '';
}
