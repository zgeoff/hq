interface SydneyTime {
  h: number;
  mi: number;
}

interface ClockTime {
  hour: number;
  minute: number;
}

export function isPast(s: SydneyTime, t: ClockTime): boolean {
  return s.h > t.hour || (s.h === t.hour && s.mi >= t.minute);
}
