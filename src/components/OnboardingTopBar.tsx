import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Building2,
  Check,
  ChevronLeft,
  CreditCard,
  LogOut,
  UserRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import BrandMark from './BrandMark';
import ChannelBrandIcon from './ChannelBrandIcon';

function WhatsAppStepIcon({ className }: { className?: string }) {
  return <ChannelBrandIcon channel="whatsapp" className={className} alt="" />;
}

const ONBOARDING_PREVIOUS_PATH_BY_ROUTE: Record<string, string> = {
  '/onboarding': '/onboarding/profile',
  '/onboarding/industry': '/onboarding/profile',
  '/onboarding/channel-connection': '/onboarding',
  '/onboarding/plans': '/onboarding/channel-connection',
};

const ONBOARDING_STEPS = [
  { path: '/onboarding/profile', label: 'Profile', icon: UserRound },
  { path: '/onboarding', label: 'Business Details', icon: Building2 },
  { path: '/onboarding/channel-connection', label: 'WhatsApp', icon: WhatsAppStepIcon },
  { path: '/onboarding/plans', label: 'Plan', icon: CreditCard },
] as const;

export default function OnboardingTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const previousPath = ONBOARDING_PREVIOUS_PATH_BY_ROUTE[location.pathname];
  const currentStepIndex = ONBOARDING_STEPS.findIndex((step) => step.path === location.pathname);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-tight text-gray-900">Connektly</span>
        </div>

        {previousPath ? (
          <button
            type="button"
            onClick={() => navigate(previousPath)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : null}
      </div>

      {currentStepIndex >= 0 ? (
        <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="flex items-center rounded-full border border-gray-200 bg-white/90 px-2 py-2 shadow-sm backdrop-blur">
            {ONBOARDING_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isComplete = index < currentStepIndex;
              const isActive = index === currentStepIndex;
              const isAccessible = index <= currentStepIndex;

              return (
                <div key={step.path} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isAccessible) {
                        navigate(step.path);
                      }
                    }}
                    disabled={!isAccessible}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? 'bg-[#1381FF] text-white shadow-sm'
                        : isComplete
                          ? 'text-[#1381FF] hover:bg-[#EEF7FF]'
                          : 'text-gray-400'
                    } ${isAccessible ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        isActive
                          ? 'bg-white/20'
                          : isComplete
                            ? 'bg-[#1381FF] text-white'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {isComplete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    {step.label}
                  </button>
                  {index < ONBOARDING_STEPS.length - 1 ? (
                    <span className="relative mx-1 h-px w-5 overflow-hidden bg-gray-200">
                      <motion.span
                        initial={false}
                        animate={{ width: index < currentStepIndex ? '100%' : '0%' }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="absolute inset-y-0 left-0 bg-[#1381FF]/50"
                      />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
