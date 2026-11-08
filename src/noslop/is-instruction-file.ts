import { isSkillText } from './is-skill-text.ts';

export function isInstructionFile(path: string): boolean {
  return /(?:^|\/)AGENTS\.md$/u.test(path) || isSkillText(path);
}
