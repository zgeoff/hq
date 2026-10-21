// A Sydney wall-clock reading, and a target time of day.
interface SydneyNow {
  h: number;
  mi: number;
}

interface DayTime {
  h: number;
  m: number;
}

export function isPast(s: SydneyNow, t: DayTime) {
  return s.h > t.h || (s.h === t.h && s.mi >= t.m);
}
