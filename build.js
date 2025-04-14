const { build } = require('bun')

const entryPoint = 'api/index.ts'

await build({
  entrypoints: [entryPoint],
  outdir: '.',
  target: 'node',
  format: 'esm',
  minify: true,
  splitting: false,
  sourcemap: 'inline',
  external: [],
})
