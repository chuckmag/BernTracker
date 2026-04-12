const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// In an npm monorepo, packages like @react-navigation/* can end up with their
// own copy of React in node_modules. Metro would then bundle two React instances
// causing "invalid hook call / useRef of null" at runtime.
// Pin both to the single copy installed in this workspace.
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
}

module.exports = config
