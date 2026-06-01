import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { Ionicons } from '@expo/vector-icons'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { GymProvider } from './src/context/GymContext'
import { ProgramFilterProvider } from './src/context/ProgramFilterContext'
import { MovementsProvider } from './src/context/MovementsContext'
import { ThemeProvider, useTheme, type ThemeColors } from './src/lib/theme'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import FeedScreen from './src/screens/FeedScreen'
import CalendarScreen from './src/screens/CalendarScreen'
import WodDetailScreen from './src/screens/WodDetailScreen'
import HistoryScreen from './src/screens/HistoryScreen'
import LogResultScreen from './src/screens/LogResultScreen'
import WorkoutEditorScreen from './src/screens/WorkoutEditorScreen'
import AnalyticsScreen from './src/screens/AnalyticsScreen'
import MovementDetailScreen from './src/screens/MovementDetailScreen'
import BenchmarkDetailScreen from './src/screens/BenchmarkDetailScreen'
import ResultDetailScreen from './src/screens/ResultDetailScreen'
import UserProfileScreen from './src/screens/UserProfileScreen'
import WodResultDetailScreen from './src/screens/WodResultDetailScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import BrowseGymsScreen from './src/screens/BrowseGymsScreen'
import AvatarHeaderButton from './src/components/AvatarHeaderButton'
import GoalsScreen from './src/screens/GoalsScreen'
import GoalDetailScreen from './src/screens/GoalDetailScreen'
import type { LeaderboardEntry, MovementPrType, BenchmarkSummaryEntry } from './src/lib/api'

// ── Param lists ──────────────────────────────────────────────────────────────

// Detail screens (WodDetail, LogResult) live on the root stack so they can be
// pushed from any tab. Tabs only carry their list screens.
export type RootStackParamList = {
  Main: undefined
  WodDetail: { workoutId: string; from?: 'feed' | 'history' | 'movement-history' | 'wodalytics' }
  LogResult: { workoutId: string; resultId?: string; existingResult?: LeaderboardEntry }
  ResultDetail: { workoutId: string; resultId: string; from?: 'dashboard' }
  UserProfile: { userId: string }
  // Modal-style editor for personal-program workouts (#242 slice 2).
  // - mode='create': new workout pinned to `scheduledAt` (YYYY-MM-DD)
  // - mode='edit':   load + edit + delete an existing workout by id
  // Mode-discriminated params keep TypeScript honest at the call site so
  // a `create` push without `scheduledAt` (or `edit` without `workoutId`)
  // fails at compile time.
  WorkoutEditor:
    | { mode: 'create'; scheduledAt: string; workoutId?: never }
    | { mode: 'edit'; workoutId: string; scheduledAt?: never }
  WodResultDetail: { entry: LeaderboardEntry; workoutTitle?: string }
  Settings: undefined
  // Goals (#434) — list + detail. The home card and Goals screen both push
  // GoalDetail with the goal id; the screen fetches the goal via
  // api.goals.get so any external mutation (auto-complete, archive) is
  // reflected on revisit.
  Goals: undefined
  GoalDetail: { goalId: string }
  // Public gym catalog (#505 / parity with web /gyms/browse). Reachable from:
  //   - OnboardingScreen step 2 (when the user has no pending invitations)
  //   - SettingsScreen → "Find another gym"
  BrowseGyms: undefined
}

export type MainTabParamList = {
  HomeTab: undefined
  FeedTab: undefined
  // Calendar tab — 3-day strip view of every program the user can see,
  // with the same multi-select program filter as the feed. Mirrors the
  // mweb narrow layout of WorkoutCalendarBoard so a member switching
  // between web and Expo sees the same window.
  CalendarTab: undefined
  HistoryTab: undefined
  AnalyticsTab: undefined
}

export type AnalyticsStackParamList = {
  Analytics: undefined
  MovementDetail: { movementId: string; name: string; prTypes: MovementPrType[] }
  BenchmarkDetail: { entry: BenchmarkSummaryEntry }
}

export type HomeStackParamList = {
  Home: undefined
}

export type FeedStackParamList = {
  Feed: undefined
}

export type CalendarStackParamList = {
  Calendar: undefined
}

export type HistoryStackParamList = {
  History: undefined
}

// Tiny stack used only while `user.onboardedAt === null`. Lets
// `OnboardingScreen` push the public gym catalog so a user who joined the
// app without a pre-existing invitation can find a gym during onboarding
// (#505). Once `onboardedAt` flips, RootNavigator drops this stack in
// favour of `RootStackNavigator` which has its own `BrowseGyms` route for
// post-onboarding use from Settings.
export type OnboardingStackParamList = {
  Onboarding: undefined
  BrowseGyms: undefined
}

// ── Navigators ───────────────────────────────────────────────────────────────

const RootStack = createStackNavigator<RootStackParamList>()
const OnboardingStack = createStackNavigator<OnboardingStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()
const HomeStack = createStackNavigator<HomeStackParamList>()
const FeedStack = createStackNavigator<FeedStackParamList>()
const CalendarStack = createStackNavigator<CalendarStackParamList>()
const HistoryStack = createStackNavigator<HistoryStackParamList>()
const AnalyticsStack = createStackNavigator<AnalyticsStackParamList>()

function buildStackScreenOptions(colors: ThemeColors) {
  return {
    headerStyle: { backgroundColor: colors.tabBarBg },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { fontWeight: '600' as const },
    cardStyle: { backgroundColor: colors.screenBg },
  }
}

// Settings lives on the root stack as a modal so it can be pushed from any
// tab's header — `mainTabHeaderRight` is the shared `headerRight` that mounts
// the avatar button on every primary tab screen.
const mainTabHeaderRight = () => <AvatarHeaderButton />

function HomeStackNavigator() {
  const { colors } = useTheme()
  return (
    <HomeStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <HomeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Today', headerRight: mainTabHeaderRight }}
      />
    </HomeStack.Navigator>
  )
}

function FeedStackNavigator() {
  const { colors } = useTheme()
  return (
    <FeedStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <FeedStack.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: 'Workouts', headerRight: mainTabHeaderRight }}
      />
    </FeedStack.Navigator>
  )
}

function CalendarStackNavigator() {
  const { colors } = useTheme()
  return (
    <CalendarStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <CalendarStack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: 'Calendar', headerRight: mainTabHeaderRight }}
      />
    </CalendarStack.Navigator>
  )
}

function HistoryStackNavigator() {
  const { colors } = useTheme()
  return (
    <HistoryStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <HistoryStack.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History', headerRight: mainTabHeaderRight }}
      />
    </HistoryStack.Navigator>
  )
}

function AnalyticsStackNavigator() {
  const { colors } = useTheme()
  return (
    <AnalyticsStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <AnalyticsStack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          headerRight: mainTabHeaderRight,
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image
                source={require('./assets/favicon.png')}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
              <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600' }}>WODalytics</Text>
            </View>
          ),
        }}
      />
      <AnalyticsStack.Screen
        name="MovementDetail"
        component={MovementDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <AnalyticsStack.Screen
        name="BenchmarkDetail"
        component={BenchmarkDetailScreen}
        options={({ route }) => ({ title: route.params.entry.name })}
      />
    </AnalyticsStack.Navigator>
  )
}

function MainTabs() {
  const { colors } = useTheme()
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.tabBarBg, borderTopColor: colors.tabBarBorder },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        // Icon-only tab bar. Labels hidden globally so the icons get the
        // full vertical real estate of the bar — keeps the row tight and
        // readable on the smallest viewports.
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="FeedTab"
        component={FeedStackNavigator}
        options={{
          title: 'Feed',
          tabBarAccessibilityLabel: 'Feed',
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="CalendarTab"
        component={CalendarStackNavigator}
        options={{
          title: 'Calendar',
          tabBarAccessibilityLabel: 'Calendar',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryStackNavigator}
        options={{
          title: 'History',
          tabBarAccessibilityLabel: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="AnalyticsTab"
        component={AnalyticsStackNavigator}
        options={{
          title: 'Analytics',
          tabBarAccessibilityLabel: 'Analytics',
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
  const { colors } = useTheme()
  return (
    <RootStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="WodDetail" component={WodDetailScreen} options={{ title: '' }} />
      <RootStack.Screen name="LogResult" component={LogResultScreen} options={{ title: 'Log Result' }} />
      <RootStack.Screen name="ResultDetail" component={ResultDetailScreen} options={{ title: 'Result' }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Athlete' }} />
      <RootStack.Screen
        name="WorkoutEditor"
        component={WorkoutEditorScreen}
        options={{ title: 'New Workout', presentation: 'modal' }}
      />
      <RootStack.Screen
        name="WodResultDetail"
        component={WodResultDetailScreen}
        options={({ route }) => ({ title: route.params.workoutTitle ?? 'Result' })}
      />
      <RootStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Profile', presentation: 'modal' }}
      />
      <RootStack.Screen name="Goals" component={GoalsScreen} options={{ title: 'Goals' }} />
      <RootStack.Screen name="GoalDetail" component={GoalDetailScreen} options={{ title: 'Goal' }} />
      <RootStack.Screen name="BrowseGyms" component={BrowseGymsScreen} options={{ title: 'Find a gym' }} />
    </RootStack.Navigator>
  )
}

// ── Root navigator — switches between auth and main ──────────────────────────

function RootNavigator() {
  const { user, isLoading } = useAuth()
  const { colors } = useTheme()

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.screenBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (!user) return <LoginScreen />
  // Onboarding gate: a user with `onboardedAt === null` hasn't filled in the
  // four required profile fields yet. Show the onboarding stack (which adds
  // a BrowseGyms route on top of OnboardingScreen so step 2 can push the
  // gym catalog) until they do. Once `maybeMarkOnboarded` flips the column
  // and `refreshUser()` picks it up, this branch falls through to the main
  // app.
  if (user.onboardedAt === null) return <OnboardingStackNavigator />
  return <RootStackNavigator />
}

function OnboardingStackNavigator() {
  const { colors } = useTheme()
  return (
    <OnboardingStack.Navigator screenOptions={buildStackScreenOptions(colors)}>
      <OnboardingStack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
      <OnboardingStack.Screen
        name="BrowseGyms"
        component={BrowseGymsScreen}
        options={{ title: 'Find a gym' }}
      />
    </OnboardingStack.Navigator>
  )
}

// ── App root ─────────────────────────────────────────────────────────────────

function ThemedStatusBar() {
  const { isDark } = useTheme()
  return <StatusBar style={isDark ? 'light' : 'dark'} />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GymProvider>
          <ProgramFilterProvider>
            <MovementsProvider>
              <NavigationContainer>
                <RootNavigator />
                <ThemedStatusBar />
              </NavigationContainer>
            </MovementsProvider>
          </ProgramFilterProvider>
        </GymProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
