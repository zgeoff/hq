import { expect, test } from 'bun:test';
import { collectLogFiles } from './collect-log-files.ts';

test('it gives the old archive, the monthly archives in month order, then the log', () => {
  expect(collectLogFiles('/srv/kettle', ['delivery.md', 'delivery-archive-2026-10.md', 'delivery-archive-2026-09.md', 'delivery-archive.md'])).toStrictEqual([
    '/srv/kettle/delivery-archive.md',
    '/srv/kettle/delivery-archive-2026-09.md',
    '/srv/kettle/delivery-archive-2026-10.md',
    '/srv/kettle/delivery.md',
  ]);
});

test('it leaves out the archives of other roles and backups', () => {
  expect(collectLogFiles('/srv/kettle', ['kettle-archive-2026-10.md', 'delivery.md.bak-20261031T010203Z', 'delivery-archive-2026-10.md.tmp-42'])).toStrictEqual([
    '/srv/kettle/delivery-archive.md',
    '/srv/kettle/delivery.md',
  ]);
});
