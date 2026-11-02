import { match } from 'ts-pattern';
import type { ReportRow } from '../shipped/types.ts';

export function pickStatePill(row: Pick<ReportRow, 'state' | 'status'>): string | null {
  return match(row.state)
    .with('closed', () => null)
    .with('canceled', () => 'Canceled')
    .with('open', () => row.status)
    .exhaustive();
}
