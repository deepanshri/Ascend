import React, { Suspense } from 'react';
import { AppShell } from './app/AppShell';
import { AuthCallbackGate } from './app/AuthCallbackGate';
import { TabLoadingFallback } from './components/TabLoadingFallback';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { AppProviders } from './providers/AppProviders';
import { useOnboarding } from './providers/OnboardingProvider';
import { useSession } from './providers/SessionProvider';

const AuthRoute = React.lazy(() => import('./routes/AuthRoute'));
const OnboardingRoute = React.lazy(() => import('./routes/OnboardingRoute'));

/** Signed out → sign in; signed in but not onboarded → onboarding; otherwise the app shell. */
function Gates() {
  const { session, authLoading } = useSession();
  const { isOnboarded } = useOnboarding();

  if (authLoading) return <TabLoadingFallback />;
  if (session && isOnboarded) return <AppShell />;
  return (
    <Suspense fallback={<TabLoadingFallback />}>{session ? <OnboardingRoute /> : <AuthRoute />}</Suspense>
  );
}

/** Links from auth emails take over the screen until they are handled. */
function Root() {
  useKeyboardInset(true);
  return (
    <AuthCallbackGate>
      <Gates />
    </AuthCallbackGate>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
