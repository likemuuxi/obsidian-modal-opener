import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { env } from 'node:process'

import { defineBuildConfig } from 'unbuild'
import builtins from 'builtin-modules'

const execAsync = promisify(exec)

export default defineBuildConfig({
  outDir: './dist',
  sourcemap: true,
  declaration: false,
  externals: [
    // Obsidian
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    // Builtins
    ...builtins,
  ],
  rollup: {
    esbuild: {
      format: 'cjs',
    },
    output: {
      dir: './dist',
      format: 'cjs',
      sourcemap: env.NODE_ENV === 'development' ? 'inline' : false,
      entryFileNames: 'main.js',
    },
    // required for unocss, ofetch, etc.
    // otherwise unbuild will detect them as external
    // dependencies that are inline implicitly external
    // by esbuild
    inlineDependencies: true,
  },
  hooks: {
    'build:done': async () => {
      await execAsync('rm -rf ./main.js')
      await execAsync('cp ./dist/main.js ./main.js')
    },
  },
})
