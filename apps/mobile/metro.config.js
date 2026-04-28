const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole monorepo so Metro can resolve shared packages at the root.
config.watchFolders = [workspaceRoot]

// Resolution order: local workspace first, root as fallback.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Force React and React Native to always resolve from this workspace.
//
// Root cause: Expo Go on the App Store caps at SDK 54, so apps/mobile was
// downgraded to SDK 54 which requires react@19.1.0. The web app uses
// react@19.2.x, and npm hoists that newer copy to root/node_modules.
// Metro's normal traversal finds the root copy first, producing two React
// instances and an "invalid hook call" crash at runtime.
//
// extraNodeModules is only a fallback — it loses to a copy found by walking
// up the directory tree. resolveRequest is an authoritative override that
// runs first and pins both packages to the local workspace copy.
//
// Remove this override once apps/mobile and apps/web share the same React
// version (i.e. after upgrading to a newer Expo SDK that Expo Go supports).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName === 'react-native') {
    return {
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      type: 'sourceFile',
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
