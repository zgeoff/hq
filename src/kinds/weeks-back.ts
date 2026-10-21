import { now } from '../clock/now.ts';
import { DAY } from './day.ts';
import { mondayOf } from './monday-of.ts';

const WEEK = 7 * DAY;

export const weeksBack = (weeks: number, at: Date = now()) => new Date(mondayOf(at).getTime() - (weeks - 1) * WEEK - DAY);
