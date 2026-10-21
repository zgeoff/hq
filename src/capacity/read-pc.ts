import { out } from '../health/out.ts';
import { formatError as msg } from './format-error.ts';
import { getReadMS as readMs } from './get-read-ms.ts';
import { READ_MS } from './read-ms.ts';
import type { CapacityProbe } from './types.ts';
import { waitWithDeadline as bounded } from './wait-with-deadline.ts';

export async function readPC(probe: CapacityProbe): Promise<{ disk: number | null; mem: number | null; errors: string[] }> {
  const errors: string[] = [];
  let disk: number | null = null;
  let mem: number | null = null;
  const df = await out(probe.run, ['df', '-P', '-B1', '/'], readMs(probe));
  const avail = df === null ? NaN : Number(df.trim().split('\n')[1]?.trim().split(/\s+/)[3]);
  if (Number.isFinite(avail)) disk = Math.round(avail);
  else errors.push('df / failed');
  try {
    const kb = Number(/^MemAvailable:\s+(\d+)/m.exec(await bounded(probe.readFile('/proc/meminfo'), READ_MS))?.[1]);
    if (!Number.isFinite(kb)) throw new Error('no MemAvailable in /proc/meminfo');
    mem = kb * 1024;
  } catch (e) {
    errors.push(msg(e));
  }
  return { disk, mem, errors };
}
