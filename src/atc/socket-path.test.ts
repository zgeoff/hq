import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { socketPath } from './socket-path.ts';
import { writeRefusal } from './write-refusal.ts';

test('a test never reaches the live atc socket, even to read', () => {
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));

  expect(socketPath()).toBe('/nonexistent/hq-test-no-live-atc.sock');
  expect(writeRefusal()).toContain('a test never writes to the live atc');
});
