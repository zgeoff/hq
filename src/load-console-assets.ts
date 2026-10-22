import { basename, join } from 'node:path';
import page from './console/index.html';

export type ConsoleAssets = Map<string, () => Response>;

// The page's files by URL path. A compiled hq carries them built (the HTML import lists them);
// run from source, hq builds them in memory. Either way the console's own handler serves them,
// so every file passes its request check.
export async function loadConsoleAssets(): Promise<ConsoleAssets> {
  const built = page.files;
  if (built !== undefined) {
    return new Map(built.map((f) => [readURLPath(f.path, page.index), () => new Response(Bun.file(f.path), { headers: f.headers })]));
  }
  return await runConsoleBuild();
}

async function runConsoleBuild(): Promise<ConsoleAssets> {
  const index = join(import.meta.dir, 'console', 'index.html'),
    result = await Bun.build({ entrypoints: [index], minify: true });
  if (!result.success) {
    throw new AggregateError(result.logs, 'the console page did not build');
  }
  return await buildAssetMap(result);
}

async function buildAssetMap(result: Bun.BuildOutput): Promise<ConsoleAssets> {
  const outputs = await Promise.all(result.outputs.map(async (o) => ({ path: readURLPath(o.path, './index.html'), body: await o.arrayBuffer(), type: o.type })));
  return new Map(outputs.map((o) => [o.path, () => new Response(o.body, { headers: { 'content-type': o.type } })]));
}

function readURLPath(file: string, index: string): string {
  if (basename(file) === basename(index)) {
    return '/';
  }
  return `/${basename(file)}`;
}
