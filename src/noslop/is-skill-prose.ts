// A skill's own text: its SKILL.md or a file under its references/, in any skills/ folder, which
// covers .claude/skills/, .agents/skills/ and sync/skills/. Scripts and test data are not prose.
const SKILL_PROSE = /(?:^|\/)skills\/[^/]+\/(?:SKILL\.md$|references\/.+)/u;

export function isSkillProse(path: string): boolean {
  return SKILL_PROSE.test(path);
}
