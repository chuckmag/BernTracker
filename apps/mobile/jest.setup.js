// react-test-renderer 19 routes uncaught render errors through
// `window.dispatchEvent`, but the jest-expo setup defines `window = global`
// without a `dispatchEvent`. Without this polyfill, any render-time error
// surfaces as `TypeError: window.dispatchEvent is not a function`, hiding the
// real cause.
if (typeof window !== 'undefined' && typeof window.dispatchEvent !== 'function') {
  window.dispatchEvent = () => true
}

// AsyncStorage's native module is null in Jest. Use the official in-memory mock
// from the package so any module that imports it (theme.ts, ProgramFilterContext,
// HomeScreen, etc.) just works in tests without each test file mocking it.
// Individual tests can still override with their own jest.mock if they need
// to drive specific responses.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
