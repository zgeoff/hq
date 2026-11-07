export function buildRecord<K extends string, V>(keys: readonly K[], value: (key: K) => V): Record<K, V> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Object.fromEntries returns string keys
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;
}
