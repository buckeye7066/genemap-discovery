// Stub. Layout.jsx imports a UniversalLinkHandler component that intercepts
// in-app navigation, but the file was missing from the repo and broke the
// production build. The original behaviour is reimplemented as the simplest
// possible no-op: rely on the React Router <Link>/<Routes> already mounted in
// App.jsx for navigation. Replace with the original handler if it's recovered
// from history.
export default function UniversalLinkHandler() {
  return null;
}
