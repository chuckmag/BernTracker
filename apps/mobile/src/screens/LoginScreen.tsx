import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '../context/AuthContext'
import { discovery, CLIENT_ID } from '../lib/keycloak'

WebBrowser.maybeCompleteAuthSession()

const redirectUri = AuthSession.makeRedirectUri({ scheme: 'com.wodalytics.app' })

const BASE_CONFIG = {
  clientId: CLIENT_ID,
  scopes: ['openid'],
  redirectUri,
  usePKCE: true,
}

export default function LoginScreen() {
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
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.logo}>WODalytics</Text>
        <Text style={styles.subtitle}>Sign in to your gym</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={disabled}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, disabled && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={disabled}
        >
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 36,
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
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
    backgroundColor: '#374151',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 13,
    marginHorizontal: 12,
  },
  googleButton: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '500',
  },
})
