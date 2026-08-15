import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  TicketPercent,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { appApi } from '../lib/api';
import { useAppData } from '../context/AppDataContext';
import FeedbackPopupStack from '../components/FeedbackPopupStack';
import OnboardingTopBar from '../components/OnboardingTopBar';
import {
  buildPrefillContact,
  loadRazorpayCheckoutScript,
  type RazorpayFailurePayload,
  type RazorpaySubscriptionSuccessPayload,
} from '../lib/razorpay';
import {
  BILLING_GST_RATE,
  BILLING_PLANS,
  buildBillingSummary,
  computeFreeTrialEndsAt,
  formatRupees,
  getBillingPlan,
  getBillingPlanByName,
  hasUsedFreeTrial,
  isFreeTrialExpired,
  isFreeTrialPlan,
  type BillingCycle,
  type BillingPlanDefinition,
  type BillingPlanCode,
  type BillingSummary,
} from '../lib/billing';
import type { AppProfile } from '../lib/types';
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TRIAL_FEATURES = [
  'No credit card required',
  'Complete onboarding and workspace setup',
  'Try inbox, templates, campaigns, and calls',
  'Upgrade to Starter or Pro whenever ready',
] as const;

type PlanSelection = 'trial' | BillingPlanCode;
const PLAN_FEATURE_LIMIT = 4;

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getAnnualSavings(planCode: BillingPlanCode, plans: BillingPlanDefinition[]) {
  const plan = getBillingPlan(planCode, plans);

  if (!plan) {
    return 0;
  }

  return Math.max(plan.monthlyBaseAmount * 12 - plan.annualBaseAmount, 0);
}

function isPaidSelection(selection: PlanSelection): selection is BillingPlanCode {
  return selection !== 'trial';
}

function getSelectionFromProfile(
  selectedPlan: string | null | undefined,
  canSelectTrial: boolean,
  plans: BillingPlanDefinition[],
): PlanSelection {
  if (selectedPlan?.trim().toLowerCase() === 'trial') {
    return canSelectTrial ? 'trial' : plans[0]?.code || 'starter';
  }

  return getBillingPlanByName(selectedPlan, plans)?.code ?? (canSelectTrial ? 'trial' : plans[0]?.code || 'starter');
}

function getOnboardingResumePath(profile: AppProfile | null | undefined) {
  if (!profile?.fullName || !profile.phone || !profile.countryCode) {
    return '/onboarding/profile';
  }

  if (!profile.companyName || !profile.industry) {
    return '/onboarding';
  }

  if (!profile.onboardingCompleted) {
    return '/onboarding/channel-connection';
  }

  return '/dashboard/home';
}

function BillingCycleToggle({
  billingCycle,
  onChange,
}: {
  billingCycle: BillingCycle;
  onChange: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => billingCycle !== 'monthly' && onChange()}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
          billingCycle === 'monthly' ? 'bg-gray-950 text-white' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => billingCycle !== 'annual' && onChange()}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
          billingCycle === 'annual' ? 'bg-gray-950 text-white' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        Yearly
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${billingCycle === 'annual' ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
          Save yearly
        </span>
      </button>
    </div>
  );
}

function PlanOptionCard({
  title,
  description,
  price,
  priceCaption,
  features,
  featureLimit = PLAN_FEATURE_LIMIT,
  selected,
  badge,
  onClick,
  actionLabel,
  actionLoading = false,
  actionDisabled = false,
  onAction,
  delay = 0,
}: {
  key?: string;
  title: string;
  description: string;
  price: string;
  priceCaption: string;
  features: readonly string[];
  featureLimit?: number;
  selected: boolean;
  badge?: string;
  onClick: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction?: () => void;
  delay?: number;
}) {
  return (
    <motion.div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ delay, duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={`group flex h-full cursor-pointer flex-col rounded-2xl border p-5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#1381FF]/30 ${
        selected
          ? 'border-[#1381FF] bg-sky-50/50 shadow-[0_14px_34px_rgba(19,129,255,0.10)]'
          : 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-gray-950">{title}</h3>
            {badge ? (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${selected ? 'bg-[#1381FF] text-white' : 'bg-gray-100 text-gray-600'}`}>
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-500">{description}</p>
        </div>
        <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border transition ${
          selected ? 'border-[#1381FF] bg-[#1381FF] shadow-[inset_0_0_0_4px_white]' : 'border-gray-300 bg-white group-hover:border-gray-400'
        }`} />
      </div>

      <div className="mb-4 mt-4 flex flex-wrap items-end gap-x-2 gap-y-1">
        <p className="text-2xl font-bold tracking-tight text-gray-950">{price}</p>
        <p className="pb-0.5 text-xs text-gray-500">{priceCaption}</p>
      </div>

      <ul className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2">
        {features.slice(0, featureLimit).map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-xs leading-4 text-gray-600">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {selected && actionLabel && onAction ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={actionDisabled}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-4 text-sm font-semibold text-white transition hover:bg-[#0F6FEA] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {actionLabel}
        </button>
      ) : null}
    </motion.div>
  );
}

export default function Plans() {
  const navigate = useNavigate();
  const { bootstrap, refresh } = useAppData();
  const canStartFreeTrial = !hasUsedFreeTrial(bootstrap?.profile);
  const hasExpiredFreeTrial = isFreeTrialExpired(bootstrap?.profile);
  const hasActiveFreeTrial = isFreeTrialPlan(bootstrap?.profile?.selectedPlan) && !hasExpiredFreeTrial;
  const shouldShowTrialOption = canStartFreeTrial || hasActiveFreeTrial;
  const [billingPlans, setBillingPlans] = useState<BillingPlanDefinition[]>(BILLING_PLANS);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [planCatalogError, setPlanCatalogError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanSelection>(
    getSelectionFromProfile(bootstrap?.profile?.selectedPlan, canStartFreeTrial, BILLING_PLANS),
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(bootstrap?.profile?.billingCycle ?? 'monthly');
  const [couponInput, setCouponInput] = useState(bootstrap?.profile?.couponCode ?? '');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(bootstrap?.profile?.couponCode ?? null);
  const [isCouponOpen, setIsCouponOpen] = useState(Boolean(bootstrap?.profile?.couponCode));
  const [quote, setQuote] = useState<BillingSummary | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isCheckoutReady, setIsCheckoutReady] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  const [isStartingTrial, setIsStartingTrial] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void appApi
      .getBillingPlans()
      .then((response) => {
        if (cancelled) return;
        const plans = response.plans.length > 0 ? response.plans : BILLING_PLANS;
        setBillingPlans(plans);
        setSelectedPlan((current) => (current === 'trial' || plans.some((plan) => plan.code === current) ? current : plans[0]?.code || 'trial'));
        setPlanCatalogError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setBillingPlans(BILLING_PLANS);
          setPlanCatalogError(error instanceof Error ? error.message : 'Using bundled pricing because the global plan catalog could not load.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPlans(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedPlan(getSelectionFromProfile(bootstrap?.profile?.selectedPlan, shouldShowTrialOption, billingPlans));

    if (bootstrap?.profile?.billingCycle) {
      setBillingCycle(bootstrap.profile.billingCycle);
    }

    setCouponInput(bootstrap?.profile?.couponCode ?? '');
    setAppliedCouponCode(bootstrap?.profile?.couponCode ?? null);
    setIsCouponOpen(Boolean(bootstrap?.profile?.couponCode));
  }, [
    bootstrap?.profile?.billingCycle,
    bootstrap?.profile?.couponCode,
    bootstrap?.profile?.freeTrialStartedAt,
    bootstrap?.profile?.razorpaySubscriptionId,
    bootstrap?.profile?.selectedPlan,
    billingPlans,
    canStartFreeTrial,
    shouldShowTrialOption,
  ]);

  useEffect(() => {
    let cancelled = false;

    void loadRazorpayCheckoutScript().then((loaded) => {
      if (!cancelled) {
        setIsCheckoutReady(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isPaidSelection(selectedPlan) || !appliedCouponCode) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    setIsApplyingCoupon(true);

    void appApi
      .getBillingQuote({
        planCode: selectedPlan,
        billingCycle,
        couponCode: appliedCouponCode,
      })
      .then((response) => {
        if (!cancelled) {
          setQuote(response.quote);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setQuote(null);
          setAppliedCouponCode(null);
          setCouponFeedback({
            tone: 'error',
            message: nextError instanceof Error ? nextError.message : 'Failed to re-apply the coupon.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsApplyingCoupon(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appliedCouponCode, billingCycle, selectedPlan]);

  const paidPlan = useMemo(
    () => (isPaidSelection(selectedPlan) ? getBillingPlan(selectedPlan, billingPlans) : null),
    [billingPlans, selectedPlan],
  );
  const fallbackSummary = useMemo(
    () =>
      paidPlan
        ? buildBillingSummary({
            planCode: paidPlan.code,
            billingCycle,
            plans: billingPlans,
          })
        : null,
    [billingCycle, billingPlans, paidPlan],
  );
  const activeSummary = quote ?? fallbackSummary;
  const trialEndsAtPreview = useMemo(
    () => computeFreeTrialEndsAt(new Date()).toISOString(),
    [],
  );
  const activeTrialEndsAt =
    isFreeTrialPlan(bootstrap?.profile?.selectedPlan) && bootstrap?.profile?.trialEndsAt
      ? bootstrap.profile.trialEndsAt
      : trialEndsAtPreview;

  const handleApplyCoupon = async () => {
    if (!isPaidSelection(selectedPlan)) {
      return;
    }

    const normalizedCode = couponInput.trim().toUpperCase();

    if (!normalizedCode) {
      setAppliedCouponCode(null);
      setQuote(null);
      setCouponFeedback({
        tone: 'error',
        message: 'Enter a coupon code before applying it.',
      });
      return;
    }

    try {
      setIsApplyingCoupon(true);
      setError(null);

      const response = await appApi.getBillingQuote({
        planCode: selectedPlan,
        billingCycle,
        couponCode: normalizedCode,
      });

      setAppliedCouponCode(normalizedCode);
      setQuote(response.quote);
      setIsCouponOpen(true);
      setCouponFeedback({
        tone: 'success',
        message: `${normalizedCode} applied to this ${response.quote.planName} plan.`,
      });
    } catch (nextError) {
      setAppliedCouponCode(null);
      setQuote(null);
      setCouponFeedback({
        tone: 'error',
        message: nextError instanceof Error ? nextError.message : 'Failed to apply the coupon.',
      });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setAppliedCouponCode(null);
    setQuote(null);
    setCouponFeedback(null);
    setIsCouponOpen(false);
  };

  const handleStartTrial = async () => {
    if (hasActiveFreeTrial && !canStartFreeTrial) {
      navigate(getOnboardingResumePath(bootstrap?.profile));
      return;
    }

    if (!canStartFreeTrial) {
      setError('Your 7-day free trial has already been used. Choose a paid plan to continue.');
      return;
    }

    try {
      setIsStartingTrial(true);
      setError(null);
      await appApi.startFreeTrial();
      await refresh();
      navigate('/dashboard/home', { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start your free trial.');
    } finally {
      setIsStartingTrial(false);
    }
  };

  const finalizeCheckout = async (response: RazorpaySubscriptionSuccessPayload) => {
    const shouldReturnToDashboard = Boolean(bootstrap?.profile?.onboardingCompleted);

    try {
      setIsFinalizingPayment(true);
      setError(null);

      await appApi.verifyBillingSubscription({
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySubscriptionId: response.razorpay_subscription_id,
        razorpaySignature: response.razorpay_signature,
      });

      await refresh();
      navigate(shouldReturnToDashboard ? '/dashboard/home' : '/onboarding/profile', { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Payment verification failed.');
    } finally {
      setIsCheckingOut(false);
      setIsFinalizingPayment(false);
    }
  };

  const handleCheckout = async () => {
    if (!isPaidSelection(selectedPlan) || !activeSummary) {
      return;
    }

    try {
      setError(null);
      setIsCheckingOut(true);

      const scriptLoaded = await loadRazorpayCheckoutScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error('Razorpay checkout failed to load. Refresh the page and try again.');
      }

      const response = await appApi.createBillingSubscription({
        planCode: selectedPlan,
        billingCycle,
        couponCode: appliedCouponCode || undefined,
      });

      setQuote(response.quote);

      const checkout = new window.Razorpay({
        key: response.keyId,
        subscription_id: response.subscriptionId,
        name: response.businessName,
        description: `${response.quote.planName} plan billed ${response.quote.billingCycleLabel.toLowerCase()}.`,
        image: response.businessLogoUrl || undefined,
        prefill: {
          name: bootstrap?.profile?.fullName || undefined,
          email: bootstrap?.profile?.email || undefined,
          contact: buildPrefillContact(bootstrap?.profile?.countryCode, bootstrap?.profile?.phone),
        },
        notes: {
          plan_name: response.quote.planName,
          billing_cycle: response.quote.billingCycleLabel,
          trial_ends_at: response.quote.trialEndsAt,
        },
        theme: {
          color: '#1381FF',
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            setIsCheckingOut(false);
          },
        },
        handler: (payload: RazorpaySubscriptionSuccessPayload) => {
          void finalizeCheckout(payload);
        },
      });

      checkout.on('payment.failed', (payload: RazorpayFailurePayload) => {
        setIsCheckingOut(false);
        setError(
          payload.error?.description ||
            payload.error?.reason ||
            'Razorpay could not authorize the subscription.',
        );
      });

      checkout.open();
    } catch (nextError) {
      setIsCheckingOut(false);
      setError(nextError instanceof Error ? nextError.message : 'Failed to start Razorpay checkout.');
    }
  };

  const summaryButtonDisabled =
    selectedPlan === 'trial'
      ? isStartingTrial || (!canStartFreeTrial && !hasActiveFreeTrial)
      : !paidPlan || isApplyingCoupon || isCheckingOut || isFinalizingPayment;
  const selectedPlanName = selectedPlan === 'trial' ? 'Trial' : paidPlan?.name || 'Paid plan';
  const selectedPlanDescription =
    selectedPlan === 'trial'
      ? hasActiveFreeTrial
        ? 'Continue onboarding with your active workspace trial.'
        : 'Start onboarding now and choose billing later.'
      : 'Start with trial access, then authorize future recurring billing through Razorpay.';
  const selectedPlanPrice =
    selectedPlan === 'trial'
      ? formatRupees(0)
      : activeSummary
        ? formatRupees(activeSummary.totalAmount)
        : paidPlan
          ? formatRupees(billingCycle === 'annual' ? paidPlan.annualBaseAmount : paidPlan.monthlyBaseAmount)
          : formatRupees(0);
  const selectedPlanPriceCaption =
    selectedPlan === 'trial'
      ? 'Due today'
      : activeSummary
        ? `${activeSummary.recurringLabel} after trial`
        : billingCycle === 'annual'
          ? 'per year before GST'
          : 'per month before GST';
  const isActionLoading = isStartingTrial || isCheckingOut || isFinalizingPayment;
  const ctaLabel =
    selectedPlan === 'trial'
      ? hasActiveFreeTrial && !canStartFreeTrial
        ? 'Continue Onboarding'
        : isStartingTrial
        ? 'Starting free trial...'
        : 'Start Free Trial'
      : isFinalizingPayment
        ? 'Verifying payment...'
        : isCheckingOut
          ? 'Opening payment...'
          : 'Continue to Payment';
  const trustSignals =
    selectedPlan === 'trial'
      ? ['No credit card required', 'Cancel anytime', 'Takes 30 seconds']
      : ['7-day trial included', 'Secure Razorpay checkout', 'Cancel anytime'];

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 pb-8 pt-20 font-sans text-gray-950 sm:px-6 lg:px-8">
      <OnboardingTopBar />

      <div className="mx-auto max-w-[1120px]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-gray-950 sm:text-[30px]">
              {hasActiveFreeTrial ? 'Continue your free trial setup.' : canStartFreeTrial ? 'Start free. Upgrade only when you are ready.' : 'Choose a plan to continue.'}
            </h1>
            <p className="mt-2 text-sm leading-5 text-gray-500">
              {hasExpiredFreeTrial
                ? 'Your 7-day trial has ended. Pick a paid plan to keep using Connektly.'
                : hasActiveFreeTrial
                  ? 'Your trial is active. Continue onboarding from where you left off.'
                  : canStartFreeTrial
                  ? 'The recommended path is to start the free trial, complete onboarding, and evaluate paid plans after setup.'
                  : 'Your free trial has already been used. Choose an active paid plan to continue with the app.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <BillingCycleToggle
              billingCycle={billingCycle}
              onChange={() => setBillingCycle((current) => (current === 'monthly' ? 'annual' : 'monthly'))}
            />
            <p className="text-xs text-gray-500">Paid plan pricing updates instantly. Trial stays free.</p>
          </div>
        </motion.div>

        <FeedbackPopupStack
          items={error ? [{ id: 'plans-error', tone: 'error' as const, message: error, onDismiss: () => setError(null) }] : []}
        />

        {planCatalogError ? (
          <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm text-amber-700">
            {planCatalogError}
          </div>
        ) : null}

        <div role="radiogroup" aria-label="Choose a plan" className={`grid gap-4 ${shouldShowTrialOption ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
          {shouldShowTrialOption ? (
            <PlanOptionCard
              title="Trial"
              description={hasActiveFreeTrial ? 'Your trial is active. Continue onboarding anytime.' : 'Recommended first step. Use Connektly before choosing billing.'}
              price="Free"
              priceCaption={hasActiveFreeTrial ? 'Active trial' : '7 days, no payment'}
              features={TRIAL_FEATURES}
              selected={selectedPlan === 'trial'}
              badge={hasActiveFreeTrial ? 'Active' : 'Recommended'}
              actionLabel={ctaLabel}
              actionLoading={isActionLoading}
              actionDisabled={summaryButtonDisabled}
              onAction={() => void handleStartTrial()}
              onClick={() => {
                setSelectedPlan('trial');
                setError(null);
              }}
            />
          ) : null}

          {billingPlans.map((plan, index) => {
            const displayAmount = billingCycle === 'annual' ? plan.annualBaseAmount : plan.monthlyBaseAmount;
            const annualSavings = getAnnualSavings(plan.code, billingPlans);

            return (
              <PlanOptionCard
                key={plan.code}
                title={plan.name}
                description={plan.headline}
                price={formatRupees(displayAmount)}
                priceCaption={
                  billingCycle === 'annual'
                    ? annualSavings > 0
                      ? `per year. Save ${formatRupees(annualSavings)}.`
                      : 'per year'
                    : 'per month before GST'
                }
                features={plan.features}
                featureLimit={3}
                selected={selectedPlan === plan.code}
                badge={plan.featured ? 'Most chosen' : undefined}
                delay={(shouldShowTrialOption ? index + 1 : index) * 0.04}
                onClick={() => {
                  setSelectedPlan(plan.code);
                  setError(null);
                }}
              />
            );
          })}
        </div>

        {isLoadingPlans ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing latest global plans...
          </div>
        ) : null}

        <motion.section
          key={`${selectedPlan}-${billingCycle}-${appliedCouponCode || 'no-coupon'}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
            <div>
              <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1381FF]">Selected plan</p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-950">{selectedPlanName}</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">{selectedPlanDescription}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3 sm:text-right">
                  <motion.p
                    key={selectedPlanPrice}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className="text-xl font-bold text-gray-950"
                  >
                    {selectedPlanPrice}
                  </motion.p>
                  <p className="mt-0.5 text-xs text-gray-500">{selectedPlanPriceCaption}</p>
                </div>
              </div>

              {selectedPlan === 'trial' ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Access</p>
                      <p className="mt-1 text-xs font-semibold text-gray-950">168 hours</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Trial end</p>
                      <p className="mt-1 text-xs font-semibold text-gray-950">{formatDate(activeTrialEndsAt)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Payment</p>
                      <p className="mt-1 text-xs font-semibold text-gray-950">Not required</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <p>
                      Free trial until <span className="font-semibold">{formatDate(activeTrialEndsAt)}</span>. You can select Starter or Pro later from billing settings.
                    </p>
                  </div>
                </>
              ) : activeSummary ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5 text-xs">
                      <span className="text-gray-500">Plan subtotal</span>
                      <span className="font-semibold text-gray-950">{formatRupees(activeSummary.baseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5 text-xs">
                      <span className="text-gray-500">GST ({Math.round(BILLING_GST_RATE * 100)}%)</span>
                      <span className="font-semibold text-gray-950">{formatRupees(activeSummary.gstAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5 text-xs">
                      <span className="text-gray-500">Coupon discount</span>
                      <span className="font-semibold text-gray-950">
                        {activeSummary.discountAmount > 0 ? `- ${formatRupees(activeSummary.discountAmount)}` : 'Not applied'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-950 px-3 py-2.5 text-xs text-white">
                      <span className="text-white/70">Recurring total</span>
                      <span className="font-semibold">{formatRupees(activeSummary.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <button
                      type="button"
                      onClick={() => setIsCouponOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <TicketPercent className="h-4 w-4 text-[#1381FF]" />
                        <span>{appliedCouponCode ? `Coupon: ${appliedCouponCode}` : 'Have a coupon?'}</span>
                      </div>
                      <span className="text-xs font-semibold text-[#1381FF]">{isCouponOpen ? 'Hide' : 'Apply'}</span>
                    </button>

                    {isCouponOpen ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={couponInput}
                            onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                            placeholder="Enter coupon code"
                            className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/15"
                          />
                          <button
                            type="button"
                            onClick={() => void handleApplyCoupon()}
                            disabled={isApplyingCoupon}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-70"
                          >
                            {isApplyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Apply
                          </button>
                          {appliedCouponCode ? (
                            <button
                              type="button"
                              onClick={handleRemoveCoupon}
                              className="h-10 rounded-xl px-2 text-sm font-semibold text-[#1381FF] transition hover:text-[#0F6FEA]"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </div>

                  {couponFeedback ? (
                    <div
                      className={`mt-3 rounded-xl px-3 py-2.5 text-xs ${
                        couponFeedback.tone === 'success'
                          ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border border-amber-100 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {couponFeedback.message}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-sky-900">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Trial runs until <span className="font-semibold">{formatDate(activeSummary.trialEndsAt)}</span>. Razorpay authorizes the future subscription mandate securely.
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="rounded-2xl bg-gray-950 p-4 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Next step</p>
              <h3 className="mt-2 text-lg font-semibold">{selectedPlan === 'trial' ? 'Start now' : 'Secure checkout'}</h3>
              <p className="mt-1 text-xs leading-5 text-white/65">
                {selectedPlan === 'trial'
                  ? hasActiveFreeTrial
                    ? 'Resume onboarding immediately with your saved trial.'
                    : 'Continue onboarding immediately without entering payment details.'
                  : isCheckoutReady
                    ? 'Razorpay checkout is ready.'
                    : 'Razorpay checkout is still loading.'}
              </p>

              <button
                onClick={() => void (selectedPlan === 'trial' ? handleStartTrial() : handleCheckout())}
                disabled={summaryButtonDisabled}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-4 text-sm font-semibold text-white transition hover:bg-[#0F6FEA] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {ctaLabel}
              </button>

              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">
                {trustSignals.map((signal) => (
                  <div key={signal} className="flex items-center gap-2 text-xs text-white/70">
                    <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex items-start gap-3 text-xs leading-5 text-white/55">
                  {selectedPlan === 'trial' ? (
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <BadgePercent className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <p>
                    {selectedPlan === 'trial'
                      ? 'This saves the trial state to your workspace profile.'
                      : 'A token authorization may appear during trial subscription setup.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
