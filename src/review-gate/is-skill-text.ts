const SKILL_TEXT = /^(?:\.claude\/)?skills\/.+\.md$/u;
const TEST_FOLDER = /\/(?:testdata|__tests__|fixtures)\//u;

export function isSkillText(path: string): boolean {
  return SKILL_TEXT.test(path) && !TEST_FOLDER.test(path);
}
