import type { ExpoConfig } from 'expo/config'

export default (): ExpoConfig => {
  // Truthy check intentionally suppresses both `undefined` and `""` —
  // an empty-string env var (e.g. `EAS_PROJECT_ID=` in `.env`) is treated as unset.
  const projectId = process.env.EAS_PROJECT_ID

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
    ...(projectId
      ? {
          updates: { url: `https://u.expo.dev/${projectId}` },
          extra: { eas: { projectId } },
        }
      : {}),
  }
}
