import type { ExpoConfig } from 'expo/config'

// Canonical wodtech Expo project. Hard default so `eas submit`/`eas build`
// resolve the project at local-CLI config-eval time without an env var dance —
// eas.json `env` blocks are only applied on the build worker, not in the local
// CLI process, so `eas submit` would otherwise prompt to write the projectId
// back into the config. Override via EAS_PROJECT_ID env var for forks or
// throwaway test projects.
const DEFAULT_PROJECT_ID = 'f0a6deb9-d571-4d24-9e33-d456bf16ebe3'

export default (): ExpoConfig => {
  // `||` (not `??`) so an empty-string env var falls back to the default —
  // matches how shells and `.env` files often clear a var by setting `KEY=`.
  const projectId = process.env.EAS_PROJECT_ID || DEFAULT_PROJECT_ID

  return {
    name: 'WODalytics',
    slug: 'wodalytics',
    owner: 'wodtech',
    version: '1.0.0',
    scheme: 'com.wodalytics.app',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    runtimeVersion: {
      policy: 'appVersion',
    },
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.wodalytics.app',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.wodalytics.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    updates: { url: `https://u.expo.dev/${projectId}` },
    extra: { eas: { projectId } },
  }
}
