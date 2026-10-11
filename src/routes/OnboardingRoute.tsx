import { OnboardingView } from '../components/OnboardingView';
import { useOnboardingActions } from '../providers/OnboardingProvider';

/** First-run onboarding for a signed-in user. */
export default function OnboardingRoute() {
  const { completeOnboarding, setOnboardingStep } = useOnboardingActions();
  return <OnboardingView onComplete={completeOnboarding} onStepChange={setOnboardingStep} />;
}
