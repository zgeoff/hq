import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { writeRefusal } from './write-refusal.ts';

test('it refuses a write from a scratch database', () => {
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));
  onTestFinished(overrideEnv('NODE_ENV', 'production'));
  onTestFinished(overrideEnv('HOME', '/home/invented'));
  onTestFinished(overrideEnv('HQ_DB', '/home/invented/scratch/r99.db'));

  expect(writeRefusal()).toBe('hq on a scratch database (/home/invented/scratch/r99.db) never writes to the live atc');
});

test('it allows a write from the live database', () => {
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', undefined));
  onTestFinished(overrideEnv('NODE_ENV', 'production'));
  onTestFinished(overrideEnv('HOME', '/home/invented'));
  onTestFinished(overrideEnv('HQ_DB', '/home/invented/.local/share/z-sessions/hq.db'));

  expect(writeRefusal()).toBeNull();
});

test('it allows a write to a socket the caller named', () => {
  onTestFinished(overrideEnv('NODE_ENV', 'production'));
  onTestFinished(overrideEnv('HOME', '/home/invented'));
  onTestFinished(overrideEnv('HQ_DB', '/home/invented/scratch/r99.db'));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', '/home/invented/fake.sock'));

  expect(writeRefusal()).toBeNull();
});
