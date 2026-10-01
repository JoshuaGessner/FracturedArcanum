import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Server modules are plain JS, so nothing else catches a name that stayed
    // behind when code moved between files — it is only a free variable until
    // the line runs. That is how `challenge:accept` came to crash the process.
    // server/game.js and server/ai.js are compiled from src/ and linted there.
    files: ['server/**/*.js'],
    ignores: ['server/game.js', 'server/ai.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-undef': 'error',
    },
  },
])
