const path = require('path')

// Workspace-hoisting compatibility:
// - jest-expo gets hoisted to repo-root node_modules (so we resolve it
//   explicitly via require.resolve to avoid Jest's preset-name lookup
//   failing in some Node versions).
// - jest-expo's preset code also `require()`s `react-native/jest-preset`
//   and `expo/src/async-require/messageSocket` — both packages live in
//   apps/mobile/node_modules (npm chose not to hoist them). The npm
//   `test` script sets NODE_PATH=node_modules:../../node_modules so the
//   preset's `require()` calls can find them at preset-load time.
const ROOT_NODE_MODULES = path.resolve(__dirname, '../../node_modules')
const PACKAGES_DIR = path.resolve(__dirname, '../../packages')

module.exports = {
  preset: path.dirname(require.resolve('jest-expo/jest-preset.js')),
  setupFiles: ['<rootDir>/jest.setup.js'],
  // react@19.1.0 is hoisted to root node_modules; pin so all consumers
  // resolve the same instance (jest-expo, RN, our test files).
  // @wodalytics/* packages are resolved to their TypeScript source so a
  // stale (or missing) dist/ build never breaks the suite — babel-preset-expo
  // compiles the .ts files on the fly. The `.js` strip mapper handles the
  // ESM-style `import './foo.js'` internal references in the source files.
  moduleNameMapper: {
    '^react$': path.resolve(ROOT_NODE_MODULES, 'react'),
    '^react/(.*)$': path.resolve(ROOT_NODE_MODULES, 'react/$1'),
    '^@wodalytics/(.*)$': path.join(PACKAGES_DIR, '$1/src/index.ts'),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
