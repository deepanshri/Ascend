import React, { Suspense } from 'react';
import { AppShell } from './app/AppShell';
import { TabLoadingFallback } from './components/TabLoadingFallback';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { AppProviders } from './providers/AppProviders';
import { useOnboarding } from './providers/OnboardingProvider';
import { useSession } from './providers/SessionProvider';

const AuthRoute = React.lazy(() => import('./routes/AuthRoute'));
const OnboardingRoute = React.lazy(() => import('./routes/OnboardingRoute'));

/** Signed out → sign in; signed in but not onboarded → onboarding; otherwise the app shell. */
function Gates() {
  useKeyboardInset(true);
  const { session, authLoading } = useSession();
  const { isOnboarded } = useOnboarding();

  if (authLoading) return <TabLoadingFallback />;
  if (session && isOnboarded) return <AppShell />;
  return (
    <Suspense fallback={<TabLoadingFallback />}>{session ? <OnboardingRoute /> : <AuthRoute />}</Suspense>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Gates />
    </AppProviders>
  );
}
