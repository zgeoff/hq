import type { Database } from 'bun:sqlite';

// bun:sqlite runs a claim's read and write in one synchronous call, so a race test can only put
// another writer between them from inside that call.
export function buildHookedDb(db: Database, sqlPrefix: string, beforeFirst: () => void): Database {
  let fired = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'query') {
        return (sql: string) => {
          if (!fired && sql.trimStart().startsWith(sqlPrefix)) {
            fired = true;
            beforeFirst();
          }
          return target.query(sql);
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, target, args);
        return result;
      };
    },
  });
}
