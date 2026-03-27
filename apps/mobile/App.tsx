import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { GymProvider } from './src/context/GymContext'
import LoginScreen from './src/screens/LoginScreen'
import FeedScreen from './src/screens/FeedScreen'
import WodDetailScreen from './src/screens/WodDetailScreen'

// ── Param lists ──────────────────────────────────────────────────────────────

export type FeedStackParamList = {
  Feed: undefined
  WodDetail: { workoutId: string }
}

export type MainTabParamList = {
  FeedTab: undefined
  // HistoryTab added in Issue #40
}

// ── Navigators ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>()
const FeedStack = createStackNavigator<FeedStackParamList>()

function FeedStackNavigator() {
  return (
    <FeedStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#111827' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
        cardStyle: { backgroundColor: '#030712' },
      }}
    >
      <FeedStack.Screen name="Feed" component={FeedScreen} options={{ title: 'Workouts' }} />
      <FeedStack.Screen name="WodDetail" component={WodDetailScreen} options={{ title: '' }} />
    </FeedStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1f2937' },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tab.Screen name="FeedTab" component={FeedStackNavigator} options={{ title: 'Feed' }} />
    </Tab.Navigator>
  )
}

// ── Root navigator — switches between auth and main ──────────────────────────

function RootNavigator() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  return user ? <MainTabs /> : <LoginScreen />
}

// ── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <GymProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </GymProvider>
    </AuthProvider>
  )
}
