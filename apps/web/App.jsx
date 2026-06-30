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

const { Pages, Layout, mainPage, publicPages = [], adminPages = [], superAdminPages = [] } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => null;
const publicPageKeys = new Set(publicPages);
const adminPageKeys = new Set(adminPages);
const superAdminPageKeys = new Set(superAdminPages);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const userIsAdmin = isAdminUser(user);
  const userIsSuperAdmin = isSuperAdmin(user);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingSpinner />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {Object.entries(Pages)
            .filter(([path]) => publicPageKeys.has(path))
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
