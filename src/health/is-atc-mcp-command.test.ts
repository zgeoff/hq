import { expect, test } from 'bun:test';
import { isAtcMcpCommand } from './is-atc-mcp-command.ts';

test.each([
  ['a bare atc mcp', 'atc\0mcp\0', true],
  ['atc mcp by its full path', '/home/kettle/.local/bin/atc\0mcp\0', true],
  ['another atc subcommand', 'atc\0daemon\0', false],
  ['another program named mcp', '/usr/bin/node\0mcp\0', false],
  ['a program whose name ends in atc', '/usr/bin/xatc\0mcp\0', false],
  ['an empty cmdline', '', false],
])('it answers %s with %p', (_label, cmdline, expected) => {
  expect(isAtcMcpCommand(cmdline)).toBe(expected);
});
