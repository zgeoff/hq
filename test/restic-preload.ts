import { beforeAll } from 'bun:test';
import { createResticTemplates } from './create-restic-templates.ts';

// The templates' two `restic init` runs take seconds, once per machine, so they run before the first
// test and never inside one.
beforeAll(() => {
  if (Bun.which('restic') !== null) {
    createResticTemplates();
  }
}, 60_000);
