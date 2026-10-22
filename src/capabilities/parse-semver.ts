const SEMVER = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;

export function parseSemver(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
