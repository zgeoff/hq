import { expect, test } from 'bun:test';
import { CapacitySchema } from './capacity-schema.ts';

test('it reads the imp room and the providers', () => {
  const parsed = CapacitySchema.parse({ imp: { freeMib: 4096, room: true }, providers: { claude: { room: true, target: 'cloud' } } });

  expect(parsed).toStrictEqual({ imp: { freeMib: 4096, room: true }, providers: { claude: { room: true, target: 'cloud' } } });
});

test('it reads an imp field of the wrong type as missing', () => {
  expect(CapacitySchema.parse({ imp: { freeMib: '4096', error: 'down' } })).toStrictEqual({ imp: { freeMib: undefined, error: 'down' } });
});

test('it reads providers of the wrong type as missing', () => {
  expect(CapacitySchema.parse({ providers: 'none' }).providers).toBeUndefined();
});

test('it rejects JSON that is not an object', () => {
  expect(CapacitySchema.safeParse(null).success).toBeFalse();
});
