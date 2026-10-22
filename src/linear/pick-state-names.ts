import { HqError } from '../errors.ts';

// The team's own spelling of each requested state name, matched without regard to case.
export function pickStateNames(requested: string[], known: string[], team: string): string[] {
  if (known.length === 0) {
    throw new HqError('bad_args', `Linear has no workflow states for team ${team}: check the team key`);
  }
  const picked = requested.map((name) => {
    const wanted = name.toLowerCase();
    const found = known.find((candidate) => candidate.toLowerCase() === wanted);
    if (found === undefined) {
      throw new HqError('bad_args', `unknown state "${name}" in team ${team}; its states are ${known.join(', ')}`);
    }
    return found;
  });
  return [...new Set(picked)];
}
