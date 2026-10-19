import { AuthView } from '../components/AuthView';
import { useCompleteSignIn } from '../hooks/useCompleteSignIn';

/** Sign in or sign up. */
export default function AuthRoute() {
  const completeSignIn = useCompleteSignIn();
  return <AuthView onAuthSuccess={completeSignIn} />;
}
