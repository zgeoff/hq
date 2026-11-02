const SKILL_PROSE = /(?:^|\/)skills\/[^/]+\/(?:SKILL\.md$|references\/.+)/u;

export function isSkillProse(path: string): boolean {
  return SKILL_PROSE.test(path);
}
