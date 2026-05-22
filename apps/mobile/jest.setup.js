// react-test-renderer 19 routes uncaught render errors through
// `window.dispatchEvent`, but the jest-expo setup defines `window = global`
// without a `dispatchEvent`. Without this polyfill, any render-time error
// surfaces as `TypeError: window.dispatchEvent is not a function`, hiding the
// real cause.
if (typeof window !== 'undefined' && typeof window.dispatchEvent !== 'function') {
  window.dispatchEvent = () => true
}
