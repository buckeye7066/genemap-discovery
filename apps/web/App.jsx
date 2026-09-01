import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { isAdminUser, isSuperAdmin } from '@/lib/roles';
import { EducationLevelProvider } from '@/lib/EducationLevelContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import LoadingSpinner from '@/components/LoadingSpinner';

const VisualEditAgent = import.meta.env.DEV
  ? lazyWithRetry(() => import('@/lib/VisualEditAgent'))
  : () => null;

const { Pages, Layout, mainPage, publicPages = [], adminPages = [], superAdminPages = [], openPages = [] } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => null;
const publicPageKeys = new Set(publicPages);
const adminPageKeys = new Set(adminPages);
const superAdminPageKeys = new Set(superAdminPages);
const openPageKeys = new Set(openPages);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, user, checkAuth } = useAuth();
  const location = useLocation();
  const userIsAdmin = isAdminUser(user);
  const userIsSuperAdmin = isSuperAdmin(user);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingSpinner />;
  }

  // auth_required is the normal anonymous/logged-out state. Let it flow to
  // the unauthenticated router below so first-time visitors reach /login.
  // Only exceptional authentication failures belong on an error screen.
  if (authError && authError.type !== 'auth_required') {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // A server/network error (NOT a genuine 401/403) must not be treated as
    // "logged out": otherwise a transient API blip — e.g. a Railway cold start
    // during a deploy — bounces a validly-authenticated user to /login. Offer a
    // retry instead so a real session survives the hiccup.
    if (authError.type === 'auth_error') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-slate-600 max-w-md">
            We're having trouble reaching the server. This is usually temporary.
          </p>
          <button
            onClick={() => checkAuth()}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-600 max-w-md">
          An unrecognized authentication error occurred. Please try again.
        </p>
        <button
          onClick={() => checkAuth()}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {Object.entries(Pages)
            .filter(([path]) => publicPageKeys.has(path) || openPageKeys.has(path))
            .map(([path, Page]) => (
              <Route
                key={path}
                path={`/${path.toLowerCase()}`}
                element={
                  <ErrorBoundary name={path}>
                    <Page />
                  </ErrorBoundary>
                }
              />
            ))}
          {publicPageKeys.has('Login') && (
            <Route
              path="/Login"
              element={
                <ErrorBoundary name="Login">
                  <Pages.Login />
                </ErrorBoundary>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/login" replace state={{ from: location }} />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {Object.entries(Pages)
          .filter(([path]) => publicPageKeys.has(path))
          .map(([path]) => (
            <Route key={path} path={`/${path.toLowerCase()}`} element={<Navigate to="/" replace />} />
          ))}
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <ErrorBoundary name={mainPageKey}>
              <MainPage />
            </ErrorBoundary>
          </LayoutWrapper>
        } />
        {Object.entries(Pages).filter(([path]) => !publicPageKeys.has(path)).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path.toLowerCase()}`}
            element={
              (adminPageKeys.has(path) && !userIsAdmin) ||
              (superAdminPageKeys.has(path) && !userIsSuperAdmin) ? (
                <Navigate to="/" replace />
              ) : (
                <LayoutWrapper currentPageName={path}>
                  <ErrorBoundary name={path}>
                    <Page />
                  </ErrorBoundary>
                </LayoutWrapper>
              )
            }
          />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {
  return (
    <AuthProvider>
      <EducationLevelProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          {import.meta.env.DEV && (
            <Suspense fallback={null}>
              <VisualEditAgent />
            </Suspense>
          )}
        </QueryClientProvider>
      </EducationLevelProvider>
    </AuthProvider>
  )
}

export default App
