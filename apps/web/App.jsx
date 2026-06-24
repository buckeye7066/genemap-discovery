import { Suspense, lazy } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
// The desktop (Electron) build loads index.html over the file:// protocol, where
// BrowserRouter reads the full OS file path as the route and matches nothing → 404.
// HashRouter keeps the route after '#', which the filesystem never sees. The web
// build (Vercel) keeps clean BrowserRouter URLs. Selected via Vite mode: the desktop
// bundle is built with `vite build --mode desktop`.
const Router = import.meta.env.MODE === 'desktop' ? HashRouter : BrowserRouter;
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { EducationLevelProvider } from '@/lib/EducationLevelContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import LoadingSpinner from '@/components/LoadingSpinner';

const VisualEditAgent = import.meta.env.DEV
  ? lazy(() => import('@/lib/VisualEditAgent'))
  : () => null;

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => null;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingSpinner />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <ErrorBoundary name={mainPageKey}>
              <MainPage />
            </ErrorBoundary>
          </LayoutWrapper>
        } />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path.toLowerCase()}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <ErrorBoundary name={path}>
                  <Page />
                </ErrorBoundary>
              </LayoutWrapper>
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
