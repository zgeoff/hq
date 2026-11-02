import type { RekeyKind, RekeySpec, RepoNames } from './rekey-specs.ts';

export interface RekeySql {
  newValue: string;
  newParams: string[];
  toParams: string[];
  toWhere: string;
  fromParams: string[];
  fromWhere: string;
}

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

function buildWhere(spec: RekeySpec, column: string, shape: string): string {
  if (!isPrefixKind(spec.kind)) {
    return `${column} = ?`;
  }
  const head = `typeof(${column}) = 'text' AND substr(${column}, 1, ${shape.length}) = ?`;
  return spec.kind === 'ref' ? `${head} AND length(${column}) > ${shape.length} AND substr(${column}, ${shape.length + 1}) NOT GLOB '*[^0-9]*'` : head;
}

export function buildRekeySql(spec: RekeySpec, column: string, names: RepoNames): RekeySql {
  const from = buildShape(spec.kind, names.from);
  const to = buildShape(spec.kind, names.to);
  return {
    fromWhere: buildWhere(spec, column, from),
    fromParams: [from],
    toWhere: buildWhere(spec, column, to),
    toParams: [to],
    newValue: isPrefixKind(spec.kind) ? `? || substr(${column}, ${from.length + 1})` : '?',
    newParams: [to],
  };
}
