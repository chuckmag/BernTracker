import { useState } from 'react'
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
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '../context/AuthContext'

WebBrowser.maybeCompleteAuthSession()

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://qa.wodalytics.com'

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Server-side Google OAuth flow.
  //
  // Google only ever sees `${API_URL}/api/auth/google/callback` as the redirect
  // URI — that's the one registered in Google Cloud Console for the web client.
  // The mobile app never appears in the OAuth handshake; the API does the code
  // exchange and then redirects to our app scheme with tokens as query params.
  // WebBrowser.openAuthSessionAsync intercepts that redirect and returns the URL.
  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const redirectUrl = Linking.createURL('/auth-callback')
      const authUrl = `${API_URL}/api/auth/google?mobile_redirect=${encodeURIComponent(redirectUrl)}`
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)

      if (result.type === 'cancel' || result.type === 'dismiss') return
      if (result.type !== 'success' || !result.url) {
        setError('Google sign-in failed. Please try again.')
        return
      }

      const { queryParams } = Linking.parse(result.url)
      const errorCode = typeof queryParams?.error === 'string' ? queryParams.error : null
      if (errorCode) {
        setError(`Google sign-in failed (${errorCode}). Check API logs.`)
        return
      }

      const accessToken = typeof queryParams?.token === 'string' ? queryParams.token : null
      const refreshToken = typeof queryParams?.refreshToken === 'string' ? queryParams.refreshToken : null
      if (!accessToken || !refreshToken) {
        setError('Google sign-in failed — no tokens returned.')
        return
      }

      await loginWithGoogle(accessToken, refreshToken)
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
        <Text style={styles.logo}>WODalytics</Text>
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
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
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
