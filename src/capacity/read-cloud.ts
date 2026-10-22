import { readLocalSetting } from '../config/read-local-setting.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import { promValue } from './prom-value.ts';
import type { CapacityProbe } from './types.ts';
import { waitWithDeadline as bounded } from './wait-with-deadline.ts';

// The cloud host's node-exporter page, at the URL the local settings file names.
export async function readCloud(probe: CapacityProbe): Promise<{ avail: number; total: number }> {
  const metricsUrl = readLocalSetting('HQ_CLOUD_METRICS_URL');
  const text = await bounded(probe.readText(metricsUrl, 5000), Math.min(6000, readMs(probe)));
  const avail = promValue(text, 'node_memory_MemAvailable_bytes');
  const total = promValue(text, 'node_memory_MemTotal_bytes');
  if (avail === null || total === null) throw new Error('the metrics page has no node_memory_MemAvailable_bytes or node_memory_MemTotal_bytes');
  return { avail: Math.round(avail), total: Math.round(total) };
}
