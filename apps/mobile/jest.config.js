const path = require('path')

module.exports = {
  preset: 'jest-expo',
  // Force React to resolve to the single copy in this workspace.
  // react-native is hoisted to the root and must NOT be remapped here.
  moduleNameMapper: {
    '^react$': path.resolve(__dirname, 'node_modules/react'),
    '^react/(.*)$': path.resolve(__dirname, 'node_modules/react/$1'),
  },
}
