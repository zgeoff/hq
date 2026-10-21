import { expect, mock, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { readCloud } from './read-cloud.ts';
import type { CapacityProbe } from './types.ts';

// A probe whose metrics page reports 2 GiB available of 8 GiB, recording each URL it fetches.
function setupTest() {
  const readText = mock<CapacityProbe['readText']>(() => Promise.resolve('node_memory_MemAvailable_bytes 2147483648\nnode_memory_MemTotal_bytes 8589934592\n'));
  const probe: CapacityProbe = { run: () => Promise.resolve({ code: 1, stdout: '', stderr: '' }), readText, readFile: () => Promise.resolve(''), readMs: 100 };
  return { readText, probe };
}

test('it fetches the metrics URL the local setting names', async () => {
  onTestFinished(overrideEnv('HQ_CLOUD_METRICS_URL', 'http://kettle-host:9100/metrics'));
  const app = setupTest();

  await expect(readCloud(app.probe)).resolves.toStrictEqual({ avail: 2_147_483_648, total: 8_589_934_592 });
  expect(app.readText).toHaveBeenCalledWith('http://kettle-host:9100/metrics', 5000);
});

test('without the setting it refuses with bad_config naming the key and fetches nothing', async () => {
  onTestFinished(overrideEnv('HQ_CLOUD_METRICS_URL', undefined));
  const app = setupTest();

  await expect(readCloud(app.probe)).rejects.toMatchObject({ code: 'bad_config', message: expect.stringContaining('HQ_CLOUD_METRICS_URL is not set') });
  expect(app.readText).not.toHaveBeenCalled();
});
