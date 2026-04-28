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

module.exports = {
  preset: path.dirname(require.resolve('jest-expo/jest-preset.js')),
  // react@19.1.0 is hoisted to root node_modules; pin so all consumers
  // resolve the same instance (jest-expo, RN, our test files).
  moduleNameMapper: {
    '^react$': path.resolve(ROOT_NODE_MODULES, 'react'),
    '^react/(.*)$': path.resolve(ROOT_NODE_MODULES, 'react/$1'),
  },
}
