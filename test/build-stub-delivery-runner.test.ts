import { expect, test } from 'bun:test';
import { buildStubDeliveryRunner } from './build-stub-delivery-runner.ts';

test('a daily call gets its date\'s text and is recorded, and render-report.sh gets the rendered text', async () => {
  const app = buildStubDeliveryRunner({ days: { '2026-10-14': 'monday text' }, rendered: 'report text' }),
    day = await app.run(['bash', '/kettle/merged-prs.sh', 'daily', '2026-10-14']),
    render = await app.run(['bash', '/kettle/render-report.sh', '--json']);

  expect([day, render, app.merged]).toStrictEqual([
    { code: 0, stdout: 'monday text', stderr: '' },
    { code: 0, stdout: 'report text', stderr: '' },
    [['daily', '2026-10-14']],
  ]);
});

test('a date with no text fails like gh offline, and a weekly call gets the weekly text', async () => {
  const app = buildStubDeliveryRunner({ days: {}, weekly: 'week text' }),
    missing = await app.run(['bash', '/kettle/merged-prs.sh', 'daily', '2026-10-13']),
    weekly = await app.run(['bash', '/kettle/merged-prs.sh', 'weekly', '2026-10-13']);

  expect([missing.code, missing.stderr, weekly.stdout]).toStrictEqual([1, 'gh: offline', 'week text']);
});

test('a command other than merged-prs.sh goes to the runner given for it', async () => {
  const app = buildStubDeliveryRunner({ days: {}, otherwise: () => Promise.resolve({ code: 3, stdout: 'x', stderr: 'y' }) }),
    result = await app.run(['bash', '/kettle/render-report.sh']);

  expect(result).toStrictEqual({ code: 3, stdout: 'x', stderr: 'y' });
});
