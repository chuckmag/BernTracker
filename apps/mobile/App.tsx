import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { GymProvider } from './src/context/GymContext'
import { ProgramFilterProvider } from './src/context/ProgramFilterContext'
import { MovementsProvider } from './src/context/MovementsContext'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import FeedScreen from './src/screens/FeedScreen'
import WodDetailScreen from './src/screens/WodDetailScreen'
import HistoryScreen from './src/screens/HistoryScreen'
import LogResultScreen from './src/screens/LogResultScreen'
import WorkoutEditorScreen from './src/screens/WorkoutEditorScreen'
import AnalyticsScreen from './src/screens/AnalyticsScreen'
import type { LeaderboardEntry } from './src/lib/api'

// ── Param lists ──────────────────────────────────────────────────────────────

// Detail screens (WodDetail, LogResult) live on the root stack so they can be
// pushed from any tab. Tabs only carry their list screens.
export type RootStackParamList = {
  Main: undefined
  WodDetail: { workoutId: string; from?: 'feed' | 'history' | 'movement-history' | 'wodalytics' }
  LogResult: { workoutId: string; resultId?: string; existingResult?: LeaderboardEntry }
  // Modal-style editor for personal-program workouts (#242 slice 2).
  // - mode='create': new workout pinned to `scheduledAt` (YYYY-MM-DD)
  // - mode='edit':   load + edit + delete an existing workout by id
  // Mode-discriminated params keep TypeScript honest at the call site so
  // a `create` push without `scheduledAt` (or `edit` without `workoutId`)
  // fails at compile time.
  WorkoutEditor:
    | { mode: 'create'; scheduledAt: string; workoutId?: never }
    | { mode: 'edit'; workoutId: string; scheduledAt?: never }
}

export type MainTabParamList = {
  HomeTab: undefined
  FeedTab: undefined
  HistoryTab: undefined
  AnalyticsTab: undefined
}

export type AnalyticsStackParamList = {
  Analytics: undefined
}

export type HomeStackParamList = {
  Home: undefined
}

export type FeedStackParamList = {
  Feed: undefined
}

export type HistoryStackParamList = {
  History: undefined
}

// ── Navigators ───────────────────────────────────────────────────────────────

const RootStack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()
const HomeStack = createStackNavigator<HomeStackParamList>()
const FeedStack = createStackNavigator<FeedStackParamList>()
const HistoryStack = createStackNavigator<HistoryStackParamList>()
const AnalyticsStack = createStackNavigator<AnalyticsStackParamList>()

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#111827' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: '600' as const },
  cardStyle: { backgroundColor: '#030712' },
}

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ title: 'Today' }} />
    </HomeStack.Navigator>
  )
}

function FeedStackNavigator() {
  return (
    <FeedStack.Navigator screenOptions={stackScreenOptions}>
      <FeedStack.Screen name="Feed" component={FeedScreen} options={{ title: 'Workouts' }} />
    </FeedStack.Navigator>
  )
}

function HistoryStackNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={stackScreenOptions}>
      <HistoryStack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
    </HistoryStack.Navigator>
  )
}

function AnalyticsStackNavigator() {
  return (
    <AnalyticsStack.Navigator screenOptions={stackScreenOptions}>
      <AnalyticsStack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image
                source={require('./assets/favicon.png')}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
              <Text style={{ color: '#ffffff', fontSize: 17, fontWeight: '600' }}>WODalytics</Text>
            </View>
          ),
        }}
      />
    </AnalyticsStack.Navigator>
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
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} options={{ title: 'Today' }} />
      <Tab.Screen name="FeedTab" component={FeedStackNavigator} options={{ title: 'Feed' }} />
      <Tab.Screen name="HistoryTab" component={HistoryStackNavigator} options={{ title: 'History' }} />
      <Tab.Screen
        name="AnalyticsTab"
        component={AnalyticsStackNavigator}
        options={{
          title: 'Analytics',
          tabBarIcon: ({ focused, size }) => (
            <Image
              source={require('./assets/favicon.png')}
              style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }}
              resizeMode="contain"
            />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

function RootStackNavigator() {
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions}>
      <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="WodDetail" component={WodDetailScreen} options={{ title: '' }} />
      <RootStack.Screen name="LogResult" component={LogResultScreen} options={{ title: 'Log Result' }} />
      <RootStack.Screen
        name="WorkoutEditor"
        component={WorkoutEditorScreen}
        options={{ title: 'New Workout', presentation: 'modal' }}
      />
    </RootStack.Navigator>
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

  return user ? <RootStackNavigator /> : <LoginScreen />
}

// ── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <GymProvider>
        <ProgramFilterProvider>
          <MovementsProvider>
            <NavigationContainer>
              <RootNavigator />
              <StatusBar style="light" />
            </NavigationContainer>
          </MovementsProvider>
        </ProgramFilterProvider>
      </GymProvider>
    </AuthProvider>
  )
}
