import { HqError } from '../errors.ts';

// hq run lane: the issue and the lane as two words, or the lane as --lane. A single quoted
// "GEO-12 cloud" arrives as one word, so split it; an issue or a session id has no space.
export function laneArgs(args: string[], flag: string | undefined): { key: string; lane: string } {
  const words = args.length === 1 ? args[0]!.trim().split(/\s+/) : args;
  const [key, pos, ...extra] = words;
  if (!key) throw new HqError('bad_args', 'give the issue: hq run lane <issue> <lane>, or hq run lane <issue> --lane <lane>');
  if (extra.length) throw new HqError('bad_args', `hq run lane takes an issue and a lane; got ${words.length} words`);
  if (pos !== undefined && flag !== undefined && pos !== flag) throw new HqError('bad_args', `the lane is given twice: ${pos} and --lane ${flag}`);
  const lane = pos ?? flag;
  if (lane === undefined || !lane.trim()) throw new HqError('bad_args', 'give the lane: hq run lane <issue> <lane>, or --lane <lane>');
  return { key, lane: lane.trim() };
}
