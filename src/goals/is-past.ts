interface SydneyTime {
  h: number;
  mi: number;
}

interface ClockTime {
  h: number;
  m: number;
}

export function isPast(s: SydneyTime, t: ClockTime): boolean {
  return s.h > t.h || (s.h === t.h && s.mi >= t.m);
}
