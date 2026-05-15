import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url), 'utf8'),
);

const nodeMajor = pkg.engines.node.match(/\d+/)?.[0];
if (!nodeMajor) {
  throw new Error(
    `Could not parse node major from engines.node: ${pkg.engines.node}`,
  );
}

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: `node${nodeMajor}`,
  format: 'esm',
  outfile: 'dist/index.mjs',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
