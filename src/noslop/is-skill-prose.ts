const SKILL_PROSE = /(?:^|\/)skills\/[^/]+\/(?:SKILL\.md$|references\/.+)/u;
const FIXTURE_FOLDER = /(?:^|\/)fixtures\//u;

export function isSkillProse(path: string): boolean {
  const match = SKILL_PROSE.exec(path);
  return match !== null && !FIXTURE_FOLDER.test(path.slice(0, match.index + 1));
}
