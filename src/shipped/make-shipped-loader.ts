import { now } from '../clock/now.ts';
import { loadShippedReport } from './load-shipped-report.ts';
import type { ShippedPeriod, ShippedReport, ShippedSources } from './types.ts';

export function makeShippedLoader(sources: ShippedSources): (period: ShippedPeriod) => Promise<ShippedReport> {
  return async (period) => await loadShippedReport(sources, period, now());
}
