import { expect, test } from 'bun:test';
import { isBotAuthor } from './is-bot-author.ts';

test.each([
  ['a login ending in [bot]', { login: 'dependabot[bot]' }, true],
  ['a login starting with app/', { login: 'app/renovate' }, true],
  ['the is_bot flag', { login: 'renovate', is_bot: true }, true],
  ['a person', { login: 'zgeoff', is_bot: false }, false],
  ['no author details', {}, false],
])('it reads %s as a bot author: %p', (_label, author, bot) => {
  expect(isBotAuthor(author)).toBe(bot);
});
