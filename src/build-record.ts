import invariant from 'tiny-invariant';

export function buildRecord<K extends string, V>(keys: readonly K[], value: (key: K) => V): Record<K, V> {
  const record: Partial<Record<K, V>> = {};
  for (const key of keys) {
    record[key] = value(key);
  }
  invariant(hasEveryKey(record, keys), 'buildRecord left a key unset');
  return record;
}

function hasEveryKey<K extends string, V>(record: Partial<Record<K, V>>, keys: readonly K[]): record is Record<K, V> {
  return keys.every((key) => Object.hasOwn(record, key));
}
