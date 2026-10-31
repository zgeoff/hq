import { existsSync } from 'node:fs';

// The skill rebuild moves capacity.sh and pacing.json from agent-delegation into delivery-lead. The
// watcher pulls the definitions checkout each tick, so hq reads whichever tree it finds.
const SKILLS = ['delivery-lead', 'agent-delegation'];

export function readLaneSkillDir(defsDir: string): string {
  const found = SKILLS.find((skill) => existsSync(`${defsDir}/skills/${skill}/scripts/capacity.sh`));
  return `${defsDir}/skills/${found ?? SKILLS[0]}`;
}
