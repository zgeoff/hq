import { expect, test } from 'bun:test';
import { loadConsoleAssets } from './load-console-assets.ts';

test('run from source, it builds the page in memory with Geist inside its stylesheet', async () => {
  const assets = await loadConsoleAssets(),
    bundlePaths = [...assets.keys()],
    css = bundlePaths.find((p) => p.endsWith('.css')) ?? '',
    page = await assets.get('/')?.().text(),
    style = await assets.get(css)?.().text();

  expect(bundlePaths).toContain('/');
  expect(bundlePaths.some((p) => p.endsWith('.js'))).toBe(true);
  expect(page).toContain('<div id="root">');
  expect(style).toContain('data:font/woff2');
  expect(style).not.toContain('fonts.googleapis.com');
}, 30_000);
