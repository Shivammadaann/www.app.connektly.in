export type BillingPlanCode = string;
export type BillingCycle = 'monthly' | 'annual';
export type BillingStatus = 'trialing' | 'active' | 'inactive' | 'past_due';

export interface BillingCouponDefinition {
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  description?: string;
}

export interface BillingAppliedCoupon extends BillingCouponDefinition {
  discountAmount: number;
}

export interface BillingPlanDefinition {
  code: BillingPlanCode;
  name: string;
  headline: string;
  description: string;
  monthlyBaseAmount: number;
  annualBaseAmount: number;
  features: string[];
  featured?: boolean;
}

export interface PlatformPricingPlanDefinition {
  id: string;
  name: string;
  currency?: string;
  monthlyPrice: number;
  annualPrice: number;
  credits?: number;
  features: string[];
  isActive: boolean;
  isRecommended: boolean;
}

export interface BillingSummary {
  planCode: BillingPlanCode;
  planName: string;
  billingCycle: BillingCycle;
  billingCycleLabel: string;
  currency: 'INR';
  baseAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  trialDays: number;
  trialEndsAt: string;
  recurringLabel: string;
  coupon: BillingAppliedCoupon | null;
}

export const BILLING_CURRENCY = 'INR' as const;
export const BILLING_GST_RATE = 0.18;
export const BILLING_DEFAULT_TRIAL_DAYS = 7;
export const BILLING_FREE_TRIAL_HOURS = 168;
const BILLING_HOUR_MS = 60 * 60 * 1000;
const BILLING_DAY_MS = 24 * BILLING_HOUR_MS;

export interface BillingAccessProfile {
  selectedPlan?: string | null;
  billingStatus?: BillingStatus | null;
  trialEndsAt?: string | null;
  freeTrialStartedAt?: string | null;
  razorpaySubscriptionId?: string | null;
}

export const BILLING_PLANS: BillingPlanDefinition[] = [
  {
    code: 'starter',
    name: 'Starter',
    headline: 'For teams launching their first production inbox.',
    description:
      'Shared inbox, automation baseline, business profile controls, and channel readiness for a lean operating team.',
    monthlyBaseAmount: 99900,
    annualBaseAmount: 999000,
    featured: true,
    features: [
      '1 shared WhatsApp workspace',
      'Template sync and delivery tools',
      'Channel setup and quality visibility',
      'Standard support during onboarding',
      'Workspace profile and contact operations',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    headline: 'For revenue teams that need tighter response operations.',
    description:
      'Everything in Starter, plus faster support, higher-touch operations, and a plan designed for scale-up teams.',
    monthlyBaseAmount: 199900,
    annualBaseAmount: 1999000,
    features: [
      'Priority support with faster response time',
      'Advanced operational workflows',
      'Deeper workspace controls for growing teams',
      'Scale-ready shared inbox setup',
      'Faster rollout for multi-channel execution',
    ],
  },
];

function normalizePlanCode(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function rupeesToPaise(value: number) {
  return Math.max(Math.round(value * 100), 0);
}

export function mapPlatformPricingPlan(plan: PlatformPricingPlanDefinition): BillingPlanDefinition | null {
  const code = normalizePlanCode(plan.id || plan.name);
  const name = plan.name?.trim();

  if (!code || !name || !plan.isActive) {
    return null;
  }

  const features = Array.isArray(plan.features) ? plan.features.map((feature) => feature.trim()).filter(Boolean) : [];
  const headline = features[0] || `For teams choosing the ${name} plan.`;

  const monthlyBaseAmount = rupeesToPaise(Number(plan.monthlyPrice) || 0);
  const annualBaseAmount = rupeesToPaise(Number(plan.annualPrice) || 0) || monthlyBaseAmount * 12;

  return {
    code,
    name,
    headline,
    description: features.slice(0, 2).join(' ') || headline,
    monthlyBaseAmount,
    annualBaseAmount,
    features,
    featured: Boolean(plan.isRecommended),
  };
}

export function mapPlatformPricingPlans(plans: PlatformPricingPlanDefinition[]) {
  const mapped = plans.map(mapPlatformPricingPlan).filter((plan): plan is BillingPlanDefinition => Boolean(plan));
  return mapped.length > 0 ? mapped : BILLING_PLANS;
}

export function getBillingPlan(planCode: BillingPlanCode, plans: BillingPlanDefinition[] = BILLING_PLANS) {
  const normalized = normalizePlanCode(planCode);
  return plans.find((plan) => normalizePlanCode(plan.code) === normalized) || null;
}

export function getBillingPlanByName(name: string | null | undefined, plans: BillingPlanDefinition[] = BILLING_PLANS) {
  if (!name) {
    return null;
  }

  const normalized = name.trim().toLowerCase();
  return plans.find((plan) => plan.name.toLowerCase() === normalized) || null;
}

export function normalizeBillingCycle(value: string | null | undefined): BillingCycle | null {
  return value === 'annual' || value === 'monthly' ? value : null;
}

export function normalizeBillingStatus(value: string | null | undefined): BillingStatus | null {
  const normalized = value?.trim().toLowerCase();

  return normalized === 'trialing' || normalized === 'active' || normalized === 'inactive' || normalized === 'past_due'
    ? normalized
    : null;
}

export function formatBillingCycleLabel(cycle: BillingCycle) {
  return cycle === 'annual' ? 'Annual' : 'Monthly';
}

export function formatRupees(amount: number) {
  const value = amount / 100;
  const hasDecimals = amount % 100 !== 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: BILLING_CURRENCY,
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  }).format(value);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * BILLING_DAY_MS);
}

export function computeTrialEndsAt(now = new Date(), trialDays = BILLING_DEFAULT_TRIAL_DAYS) {
  return addDays(now, Math.max(trialDays, 0));
}

export function computeFreeTrialEndsAt(now = new Date()) {
  return new Date(now.getTime() + BILLING_FREE_TRIAL_HOURS * BILLING_HOUR_MS);
}

export function isFreeTrialPlan(value: string | null | undefined) {
  return value?.trim().toLowerCase() === 'trial';
}

export function hasUsedFreeTrial(profile: BillingAccessProfile | null | undefined) {
  return Boolean(profile?.freeTrialStartedAt || isFreeTrialPlan(profile?.selectedPlan));
}

export function getTrialRemainingMs(trialEndsAt: string | null | undefined, now = new Date()) {
  if (!trialEndsAt) {
    return null;
  }

  const endTime = new Date(trialEndsAt).getTime();

  if (!Number.isFinite(endTime)) {
    return null;
  }

  return Math.max(endTime - now.getTime(), 0);
}

export function getTrialDaysLeft(trialEndsAt: string | null | undefined, now = new Date()) {
  const remainingMs = getTrialRemainingMs(trialEndsAt, now);

  if (remainingMs === null) {
    return null;
  }

  return remainingMs === 0 ? 0 : Math.ceil(remainingMs / BILLING_DAY_MS);
}

export function formatTrialDaysLeft(trialEndsAt: string | null | undefined, now = new Date()) {
  const daysLeft = getTrialDaysLeft(trialEndsAt, now);

  if (daysLeft === null) {
    return 'Trial timer not started';
  }

  if (daysLeft <= 0) {
    return 'Trial expired';
  }

  return `${daysLeft} ${daysLeft === 1 ? 'Day' : 'Days'} Left of trial`;
}

export function isFreeTrialExpired(profile: BillingAccessProfile | null | undefined, now = new Date()) {
  if (
    !isFreeTrialPlan(profile?.selectedPlan) ||
    profile?.razorpaySubscriptionId ||
    profile?.billingStatus === 'active'
  ) {
    return false;
  }

  const remainingMs = getTrialRemainingMs(profile?.trialEndsAt, now);

  return remainingMs !== null && remainingMs <= 0;
}

export function hasDashboardBillingAccess(profile: BillingAccessProfile | null | undefined, now = new Date()) {
  if (profile?.billingStatus === 'active') {
    return true;
  }

  if (!profile?.selectedPlan) {
    return false;
  }

  if (profile.razorpaySubscriptionId) {
    return true;
  }

  return !isFreeTrialExpired(profile, now);
}

function getPlanBaseAmount(plan: BillingPlanDefinition, billingCycle: BillingCycle) {
  return billingCycle === 'annual' ? plan.annualBaseAmount : plan.monthlyBaseAmount;
}

function getCouponDiscount(baseAmount: number, coupon?: BillingCouponDefinition | null) {
  if (!coupon) {
    return 0;
  }

  if (coupon.kind === 'percent') {
    return Math.min(baseAmount, Math.round((baseAmount * coupon.value) / 100));
  }

  return Math.min(baseAmount, Math.round(coupon.value * 100));
}

export function buildBillingSummary(args: {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  coupon?: BillingCouponDefinition | null;
  now?: Date;
  trialDays?: number;
  plans?: BillingPlanDefinition[];
}): BillingSummary {
  const plan = getBillingPlan(args.planCode, args.plans);

  if (!plan) {
    throw new Error(`Unsupported billing plan: ${args.planCode}`);
  }

  const billingCycleLabel = formatBillingCycleLabel(args.billingCycle);
  const baseAmount = getPlanBaseAmount(plan, args.billingCycle);
  const discountAmount = getCouponDiscount(baseAmount, args.coupon);
  const taxableAmount = Math.max(baseAmount - discountAmount, 0);
  const gstAmount = Math.round(taxableAmount * BILLING_GST_RATE);
  const totalAmount = taxableAmount + gstAmount;
  const trialDays = args.trialDays ?? BILLING_DEFAULT_TRIAL_DAYS;
  const trialEndsAt = computeTrialEndsAt(args.now, trialDays).toISOString();

  return {
    planCode: plan.code,
    planName: plan.name,
    billingCycle: args.billingCycle,
    billingCycleLabel,
    currency: BILLING_CURRENCY,
    baseAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    totalAmount,
    trialDays,
    trialEndsAt,
    recurringLabel: args.billingCycle === 'annual' ? 'per year' : 'per month',
    coupon: args.coupon
      ? {
          ...args.coupon,
          discountAmount,
        }
      : null,
  };
}
