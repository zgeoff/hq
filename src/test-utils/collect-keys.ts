// Object.keys types its result as string[]; the guard narrows each key to one the table declares.
export function collectKeys<const Table extends object>(table: Table): (keyof Table & string)[] {
  return Object.keys(table).filter((key): key is keyof Table & string => key in table);
}
