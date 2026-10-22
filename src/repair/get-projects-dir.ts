import { config } from '../config/config.ts';

export function getProjectsDir(): string {
  return config().HQ_CLAUDE_PROJECTS ?? `${process.env['HOME']}/.claude/projects`;
}
