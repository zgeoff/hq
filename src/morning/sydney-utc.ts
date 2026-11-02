import { sydney } from './sydney.ts';

export function sydneyUtc(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const s = sydney(new Date(t));
    const seen = Date.UTC(s.y, s.mo - 1, s.d, s.h, s.mi);
    if (seen === want) break;
    t += want - seen;
  }
  return new Date(t);
}
