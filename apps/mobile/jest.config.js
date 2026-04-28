const path = require('path')

module.exports = {
  preset: 'jest-expo',
  // Force React to resolve to the single copy in this workspace (react@19.1.0).
  // The root node_modules may have a newer copy hoisted from the web app;
  // pinning here prevents multiple-React-instance errors in tests.
  //
  // react-native lives in root node_modules (deduplicated by npm) and must
  // NOT be remapped — jest-expo's setup.js and resolver expect the root copy.
  moduleNameMapper: {
    '^react$': path.resolve(__dirname, 'node_modules/react'),
    '^react/(.*)$': path.resolve(__dirname, 'node_modules/react/$1'),
  },
}
