import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useRef } from 'react'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useAuthRequest, ResponseType } from 'expo-auth-session'
import { useAuth } from '../context/AuthContext'

// Required so the auth session can close the browser after redirect
WebBrowser.maybeCompleteAuthSession()

// The Expo auth proxy (auth.expo.io) is a stable HTTPS URL that Google Cloud
// Console accepts. Add https://auth.expo.io/@chuckmag/berntracker to the
// authorized redirect URIs for the web OAuth client (one-time setup).
//
// Hardcoded because makeRedirectUri({ useProxy: true }) requires expo-constants
// to expose the owner + slug from app.json at runtime, which is unreliable in
// Expo Go dev mode. The proxy URL is stable and known — hardcoding it is safe.
//
// useProxy: true in promptAsync() encodes the local Expo Go URL into the OAuth
// state param so the proxy knows where to redirect back after Google completes auth.
// returnUrl is passed explicitly because v5.5's internal makeRedirectUri() reads
// Constants.manifest (deprecated in SDK 45+) and returns null in SDK 54, causing
// the proxy to have no return address. Linking.createURL('/') reads the live
// Expo Go dev server URL (exp://host:port/--/) directly instead.
// This requires expo-auth-session ~5.5.x (useProxy was removed in v7).
// expo doctor will warn about the version but the app works correctly.
const EXPO_PROXY_REDIRECT_URI = 'https://auth.expo.io/@chuckmag/berntracker'

// Google OAuth 2.0 endpoints
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
}

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Base useAuthRequest (not Google provider) so no iosClientId platform check.
  // ResponseType.IdToken returns id_token in response.params directly —
  // no code exchange or client secret needed.
  const nonce = useRef(Math.random().toString(36).slice(2))
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
      redirectUri: EXPO_PROXY_REDIRECT_URI,
      responseType: ResponseType.IdToken,
      scopes: ['openid', 'email', 'profile'],
      usePKCE: false,
      extraParams: { nonce: nonce.current },
    },
    GOOGLE_DISCOVERY,
  )

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token
      if (idToken) {
        handleGoogleAuth(idToken)
      } else {
        setError('Google sign-in failed — no ID token received.')
      }
    } else if (response?.type === 'error') {
      setError('Google sign-in failed. Please try again.')
    }
  }, [response])

  async function handleGoogleAuth(idToken: string) {
    setError(null)
    setLoading(true)
    try {
      await loginWithGoogle(idToken)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed'
      setError(msg === 'Unauthorized' ? 'Invalid email or password.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>BernTracker</Text>
        <Text style={styles.subtitle}>Sign in to your gym</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
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
          style={[styles.googleButton, (!request || loading) && styles.buttonDisabled]}
          onPress={() => promptAsync({ useProxy: true, returnUrl: Linking.createURL('/') })}
          disabled={!request || loading}
        >
          <Text style={styles.googleButtonText}>Sign in with Google</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 12,
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
