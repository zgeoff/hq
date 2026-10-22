import type { RekeyKind, RekeySpec, RepoNames } from './rekey-specs.ts';

export interface RekeySql {
  // The new value of the column in a row that matches `from`, as SQL over `column`.
  newValue: string;
  newParams: string[];
  toParams: string[];
  toWhere: string;
  fromParams: string[];
  fromWhere: string;
}

// The text a value starts with (a prefix kind) or equals (a whole-value kind) for one repo name.
function buildShape(kind: RekeyKind, name: string): string {
  if (kind === 'slug') {
    return `zgeoff/${name}`;
  }
  if (kind === 'ref') {
    return `${name}#`;
  }
  return kind === 'url' ? `https://github.com/zgeoff/${name}/` : name;
}

function isPrefixKind(kind: RekeyKind): boolean {
  return kind === 'ref' || kind === 'url';
}

// A ref is the prefix and then digits only; a url is the prefix and whatever follows.
function buildWhere(spec: RekeySpec, column: string, shape: string): string {
  if (!isPrefixKind(spec.kind)) {
    return `${column} = ?`;
  }
  const head = `typeof(${column}) = 'text' AND substr(${column}, 1, ${shape.length}) = ?`;
  return spec.kind === 'ref' ? `${head} AND length(${column}) > ${shape.length} AND substr(${column}, ${shape.length + 1}) NOT GLOB '*[^0-9]*'` : head;
}

// `column` is the column as it must read in the statement, such as "n"."repo" for a joined table.
// The shapes hold the names as given, bound as parameters and never put into the SQL.
export function buildRekeySql(spec: RekeySpec, column: string, names: RepoNames): RekeySql {
  const from = buildShape(spec.kind, names.from),
    to = buildShape(spec.kind, names.to);
  return {
    fromWhere: buildWhere(spec, column, from),
    fromParams: [from],
    toWhere: buildWhere(spec, column, to),
    toParams: [to],
    newValue: isPrefixKind(spec.kind) ? `? || substr(${column}, ${from.length + 1})` : '?',
    newParams: [to],
  };
}
