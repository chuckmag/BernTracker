import { useEffect, useState } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '../context/AuthContext'
import { discovery, CLIENT_ID } from '../lib/keycloak'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

WebBrowser.maybeCompleteAuthSession()

// Pin an explicit path on the OAuth redirect URI. `com.wodalytics.app://`
// (no path) is technically incomplete per RFC 3986 and Keycloak's URI
// matcher rejects it as `invalid_redirect_uri` even with a `://*` wildcard
// in the allow-list. A real path produces `com.wodalytics.app://redirect`
// which is a well-formed URI that Keycloak can match exactly.
const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'com.wodalytics.app',
  path: 'redirect',
})

const BASE_CONFIG = {
  clientId: CLIENT_ID,
  scopes: ['openid', 'offline_access'],
  redirectUri,
  usePKCE: true,
}

export default function LoginScreen() {
  const { colors } = useTheme()
  const { loginWithTokens } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Two separate requests: same PKCE config, Google variant adds kc_idp_hint
  // so Keycloak skips its login form and goes straight to Google.
  const [requestStd, responseStd, promptStandard] = AuthSession.useAuthRequest(BASE_CONFIG, discovery)
  const [requestGoogle, responseGoogle, promptGoogle] = AuthSession.useAuthRequest(
    { ...BASE_CONFIG, extraParams: { kc_idp_hint: 'google' } },
    discovery,
  )

  async function handleResponse(
    response: AuthSession.AuthSessionResult | null,
    request: AuthSession.AuthRequest | null,
  ) {
    if (!response) return
    if (response.type === 'error') {
      setError(response.error?.description ?? 'Authentication failed.')
      setLoading(false)
      return
    }
    if (response.type === 'cancel' || response.type === 'dismiss') {
      setLoading(false)
      return
    }
    if (response.type !== 'success') return

    try {
      const tokenRes = await AuthSession.exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          redirectUri,
          code: response.params.code,
          extraParams: { code_verifier: request!.codeVerifier! },
        },
        discovery,
      )
      await loginWithTokens(tokenRes.accessToken, tokenRes.refreshToken!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed')
      setLoading(false)
    }
  }

  useEffect(() => { handleResponse(responseStd, requestStd) }, [responseStd])
  useEffect(() => { handleResponse(responseGoogle, requestGoogle) }, [responseGoogle])

  async function handleSignIn() {
    setError(null)
    setLoading(true)
    await promptStandard()
  }

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    await promptGoogle()
  }

  const ready = !!requestStd && !!requestGoogle
  const disabled = loading || !ready

  return (
    <ThemedView variant="screen" style={styles.container}>
      <View style={styles.inner}>
        <ThemedText style={styles.logo}>WODalytics</ThemedText>
        <ThemedText variant="tertiary" style={styles.subtitle}>Sign in to your gym</ThemedText>

        {error && <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, disabled && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={disabled}
        >
          {loading
            ? <ActivityIndicator color={colors.onPrimary} />
            : <ThemedText style={[styles.buttonText, { color: colors.onPrimary }]}>Sign In</ThemedText>
          }
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderInteractive }]} />
          <ThemedText variant="tertiary" style={styles.dividerText}>or</ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: colors.borderInteractive }]} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, { borderColor: colors.borderInteractive }, disabled && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={disabled}
        >
          <ThemedText variant="secondary" style={styles.googleButtonText}>Sign in with Google</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 36,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    marginHorizontal: 12,
  },
  googleButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
})
