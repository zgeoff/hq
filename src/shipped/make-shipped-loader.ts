import { now } from '../clock/now.ts';
import { loadShippedReport } from './load-shipped-report.ts';
import type { ShippedPeriod, ShippedReport, ShippedSources } from './types.ts';

// The console's loader: each call makes the period's report at the clock's time. What it reads is
// kept in the database by the loaders it calls, so a restart loses none of it.
export function makeShippedLoader(sources: ShippedSources): (period: ShippedPeriod) => Promise<ShippedReport> {
  return async (period) => await loadShippedReport(sources, period, now());
}
