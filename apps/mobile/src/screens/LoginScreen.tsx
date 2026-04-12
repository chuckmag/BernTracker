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
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { useAuth } from '../context/AuthContext'

// Required so the auth session can close the browser after redirect
WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
      // Expo Go: exp://<local-ip>:8081/--/auth-callback
      // Production build: com.berntracker.app://auth-callback
      // Google only ever sees http://localhost:3000/api/auth/google/callback —
      // the exp:// redirect is server→app, never shown to Google.
      const redirectUri = Linking.createURL('/auth-callback')
      const result = await WebBrowser.openAuthSessionAsync(
        `${apiUrl}/api/auth/google?mobile_redirect=${encodeURIComponent(redirectUri)}`,
        redirectUri,
      )

      if (result.type === 'success') {
        const { queryParams } = Linking.parse(result.url)
        const token = queryParams?.token as string | undefined
        const refreshToken = queryParams?.refreshToken as string | undefined
        if (token && refreshToken) {
          await loginWithGoogle(token, refreshToken)
        } else {
          setError('Google sign-in failed — no token received.')
        }
      }
      // result.type === 'cancel' means the user closed the browser — no error needed
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
