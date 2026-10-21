import { expect, test } from 'bun:test';
import { buildCapacityProbe } from './build-capacity-probe.ts';

test('the capacity probe hands the child the env it is given, over its own', async () => {
  const ran = await buildCapacityProbe().run(['sh', '-c', 'printf %s "$OP_SERVICE_ACCOUNT_TOKEN"'], { env: { OP_SERVICE_ACCOUNT_TOKEN: 'ops_invented-kettle-0042' } });

  expect([ran.code, ran.stdout]).toStrictEqual([0, 'ops_invented-kettle-0042']);
});
