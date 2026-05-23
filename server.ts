import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createClient, type User } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import {
  BILLING_CURRENCY,
  BILLING_DEFAULT_TRIAL_DAYS,
  buildBillingSummary,
  computeFreeTrialEndsAt,
  getBillingPlan,
  hasUsedFreeTrial,
  mapPlatformPricingPlans,
  normalizeBillingCycle,
  normalizeBillingStatus,
  type BillingPlanDefinition,
  type BillingCouponDefinition,
  type BillingCycle,
  type BillingPlanCode,
  type PlatformPricingPlanDefinition,
} from './src/lib/billing';
import { normalizeConversationThreadStatus } from './src/lib/lead-status';
import { normalizeSdpString } from './src/lib/sdp';
import type {
  BillingQuoteInput,
  CallLog,
  CreateWalletTopupInput,
  AutomationRule,
  AutomationRuleAction,
  AutomationRuleFilterCondition,
  AutomationRuleFilterGroup,
  AutomationRuleInput,
  WhatsAppCallDirection,
  WhatsAppCallManageInput,
  WhatsAppCallManageResponse,
  WhatsAppCallPermissionResponse,
  WhatsAppCallSettings,
  WhatsAppCallSettingsUpdateInput,
  WhatsAppCallSessionRecord,
  WhatsAppCallState,
  ContactUpdateInput,
  ContactUpsertInput,
  ConnectInstagramBusinessLoginInput,
  ConnectMessengerPageLoginInput,
  ConversationMessage,
  CreateTemplateInput,
  ConversationThread,
  DashboardBootstrap,
  DeveloperApiCredential,
  DeveloperApiCredentialCreateInput,
  DeveloperApiScope,
  DeveloperWebhookCreateInput,
  DeveloperWebhookEndpoint,
  DeveloperWebhookEvent,
  DeveloperWebhookUpdateInput,
  EmailCampaign,
  EmailCampaignSendInput,
  EmailConnectionStatus,
  EmailConnectionSummary,
  EmailConnectionUpsertInput,
  EmailConnectionVerifyResponse,
  EmailMessage,
  EmailRecipient,
  EmailTemplate,
  EmailTemplateSaveInput,
  EmbeddedMetaConnectionInput,
  LaunchMarketingCampaignInput,
  LaunchMarketingCampaignResponse,
  InviteWorkspaceUserInput,
  UpdateWorkspaceTeamMemberInput,
  InboxInsightsChannel,
  InboxInsightsResponse,
  InstagramChannelConnection,
  InstagramConnectableAccount,
  MarketingCampaignRecipientResult,
  MarketingMessageProductPolicy,
  MessengerChannelConnection,
  MessengerConnectablePage,
  MetaAdsCampaignPeriod,
  MetaAdsCampaignStatusUpdateInput,
  MetaAdsCampaignStatusUpdateResponse,
  MetaAdsCampaignsResponse,
  MetaAdsCreationSetupResponse,
  MetaAdsMediaAsset,
  MetaAdsMediaLibraryResponse,
  MetaAdsManagedAd,
  MetaAdsManagedCampaign,
  MetaAdsAdAccountOption,
  MetaAdsIntegrationConfig,
  MetaAdsLeadFormOption,
  MetaAdsIntegrationOptionsInput,
  MetaAdsIntegrationSaveInput,
  MetaAdsIntegrationSetupResponse,
  MetaAdsPixelOption,
  MetaCatalogCreateInput,
  MetaCatalogConnectionInput,
  MetaCatalogItemsBatchInput,
  MetaCatalogListResponse,
  MetaCatalogProductsResponse,
  MetaCatalogSelectionInput,
  MetaCatalogSummary,
  MetaAdsPageOption,
  MetaAdsWhatsAppAccountOption,
  MetaCatalogWebhookSetupResponse,
  MetaChannelConnection,
  MetaLeadCaptureConfig,
  MetaLeadCaptureEvent,
  MetaLeadCapturePageSubscription,
  MetaLeadCaptureConnectionInput,
  MetaTemplate,
  MetaOAuthCodeExchangeInput,
  MetaOAuthCodeExchangeResponse,
  NotificationPreferences,
  NotificationPreferencesUpdateInput,
  NotificationType,
  MetaLeadCaptureSetupInput,
  MetaLeadCaptureSetupResponse,
  ProfileUpsertInput,
  SendMediaMessageInput,
  SendCallPermissionRequestInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  SendWhatsAppMessageInput,
  UserNotification,
  VerifyWalletTopupInput,
  WalletFeatureFlags,
  WalletSummary,
  WalletTransaction,
  WalletTransactionPurpose,
  WalletTransactionSource,
  WalletTransactionStatus,
  WalletTransactionType,
  WalletType,
  WhatsAppAutomationCommand,
  WhatsAppBusinessAccountActivity,
  WhatsAppBusinessActivitiesFilters,
  WhatsAppBusinessActivitiesResponse,
  WhatsAppBlockedUser,
  WhatsAppBlockedUsersMutationResponse,
  WhatsAppBlockedUsersResponse,
  WhatsAppBusinessProfile,
  WhatsAppDisplayNameRequest,
  WhatsAppDisplayNameUpdateInput,
  WhatsAppOfficialBusinessAccountStatus,
  WhatsAppOfficialBusinessAccountUpdateInput,
  WhatsAppOfficialBusinessAccountUpdateResponse,
  WhatsAppCommerceSettings,
  WhatsAppCommerceSettingsUpdateInput,
  WhatsAppBusinessProfileUpdateInput,
  WhatsAppConversationalAutomationConfig,
  WhatsAppConversationalAutomationUpdateInput,
  WhatsAppFlow,
  WhatsAppFlowCategory,
  WhatsAppFlowField,
  WhatsAppFlowFieldType,
  WhatsAppFlowInput,
  WhatsAppFlowUpdateInput,
  WhatsAppMessagePayload,
  WooCommerceAutomationId,
  WooCommerceAutomationSetting,
  WooCommerceConnection,
  WooCommerceConnectionInput,
  WooCommerceConnectionVerifyInput,
  WorkspaceOptionDefinition,
  WorkspaceOptionInput,
  WorkspaceTeamMember,
} from './src/lib/types';

declare global {
  namespace Express {
    interface Request {
      authedUser?: User;
      developerApiCredential?: DeveloperApiCredential;
      rawBody?: Buffer;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const graphVersion = process.env.META_GRAPH_VERSION || 'v24.0';
const officialBusinessAccountGraphVersion = process.env.META_OBA_GRAPH_VERSION || 'v25.0';
const obaStatusCacheTtlMs = 5 * 60 * 1000;

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return fallback;
}
const MAX_TEMPLATE_URL_BUTTONS = 1;
const MAX_TEMPLATE_QUICK_REPLY_BUTTONS = 2;
const MAX_TEMPLATE_FLOW_BUTTONS = 1;
const MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH = 25;
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const TEMPLATE_HEADER_MEDIA_PREVIEW_KEY = '__connektly_header_media_preview';
const TEMPLATE_HEADER_MEDIA_ROUTE = '/template-header-media';
const TEMPLATE_HEADER_MEDIA_API_ROUTE = '/api/template-header-media';
const TEMPLATE_HEADER_MEDIA_BUCKET =
  normalizeOptionalString(process.env.TEMPLATE_HEADER_MEDIA_BUCKET) || 'app-profile-pictures';
const templateHeaderMediaDir = path.join(__dirname, 'storage', 'template-header-media');
const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const RECOMMENDED_WHATSAPP_FLOW_JSON_VERSION = '7.3';
const RECOMMENDED_WHATSAPP_FLOW_DATA_API_VERSION = '4.0';
const RECOMMENDED_WHATSAPP_FLOW_MESSAGE_VERSION = '3';
const SUPPORTED_WHATSAPP_FLOW_JSON_PUBLISHING_VERSIONS = new Set([
  '5.1',
  '6.0',
  '6.1',
  '6.2',
  '6.3',
  '7.0',
  '7.1',
  '7.2',
  '7.3',
]);
const SUPPORTED_WHATSAPP_FLOW_DATA_API_VERSIONS = new Set(['3.0', '4.0']);
const SUPPORTED_WHATSAPP_FLOW_MESSAGE_VERSIONS = new Set(['3']);
const whatsAppFlowJsonVersion = resolveConfiguredMetaVersion(
  'META_FLOW_JSON_VERSION',
  RECOMMENDED_WHATSAPP_FLOW_JSON_VERSION,
  SUPPORTED_WHATSAPP_FLOW_JSON_PUBLISHING_VERSIONS,
);
const whatsAppFlowDataApiVersion = resolveConfiguredMetaVersion(
  'META_FLOW_DATA_API_VERSION',
  RECOMMENDED_WHATSAPP_FLOW_DATA_API_VERSION,
  SUPPORTED_WHATSAPP_FLOW_DATA_API_VERSIONS,
);
const whatsAppFlowMessageVersion = resolveConfiguredMetaVersion(
  'META_FLOW_MESSAGE_VERSION',
  RECOMMENDED_WHATSAPP_FLOW_MESSAGE_VERSION,
  SUPPORTED_WHATSAPP_FLOW_MESSAGE_VERSIONS,
);
const WHATSAPP_FLOW_CATEGORIES = new Set([
  'SIGN_UP',
  'SIGN_IN',
  'APPOINTMENT_BOOKING',
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'OTHER',
]);
const WHATSAPP_FLOW_FIELD_TYPES = new Set(['text', 'number', 'email', 'phone', 'date', 'select']);
const MAX_FLOW_FIELDS = 20;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const metaAppId = process.env.META_APP_ID || process.env.VITE_META_APP_ID || '';
const metaAppSecret = process.env.META_APP_SECRET || '';
const instagramAppId = process.env.INSTAGRAM_APP_ID || metaAppId;
const instagramAppSecret = process.env.INSTAGRAM_APP_SECRET || metaAppSecret;
const metaRedirectUri = process.env.META_REDIRECT_URI || '';
const metaWebhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
const messengerWebhookVerifyToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN || metaWebhookVerifyToken;
const instagramWebhookVerifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || messengerWebhookVerifyToken;
const tokenEncryptionSecret = process.env.META_TOKEN_ENCRYPTION_KEY || '';
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const razorpayBusinessName = process.env.RAZORPAY_BRAND_NAME || 'Connektly';
const razorpayBusinessLogoUrl = process.env.RAZORPAY_BRAND_LOGO_URL || '';
const razorpayTrialDays = Number(process.env.RAZORPAY_TRIAL_DAYS || BILLING_DEFAULT_TRIAL_DAYS);
const razorpayMonthlyTotalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY || 120);
const razorpayAnnualTotalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_ANNUAL || 10);
const enablePlatformWallet = parseBooleanEnv(process.env.ENABLE_PLATFORM_WALLET, true);
const enableCampaignEstimator = parseBooleanEnv(process.env.ENABLE_CAMPAIGN_ESTIMATOR, true);
const enableWabaCreditBilling = parseBooleanEnv(process.env.ENABLE_WABA_CREDIT_BILLING, false);
const enablePartnerBillingMode = parseBooleanEnv(process.env.ENABLE_PARTNER_BILLING_MODE, false);
const walletPricingOverviewUrl = process.env.WALLET_PRICING_OVERVIEW_URL || 'https://pricing.connektly.in';
const APP_PROFILE_PICTURE_BUCKET = 'app-profile-pictures';
const MAX_APP_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const MESSENGER_PROFILE_ENRICHMENT_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_MESSENGER_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_reads',
  'message_deliveries',
  'message_echoes',
] as const;
const DEFAULT_INSTAGRAM_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_reactions',
  'message_reads',
] as const;
const DEVELOPER_API_SCOPES: DeveloperApiScope[] = [
  'messages:read',
  'messages:write',
  'contacts:read',
  'contacts:write',
  'webhooks:manage',
];
const DEVELOPER_WEBHOOK_EVENTS: DeveloperWebhookEvent[] = [
  'message.received',
  'message.read',
  'message.delivered',
  'message.failed',
  'conversation.created',
  'contact.created',
  'template.status_updated',
  'campaign.sent',
];
const RAZORPAY_TRACKED_WEBHOOK_EVENTS = [
  'payment.authorized',
  'payment.pending',
  'payment.failed',
  'payment.captured',
  'payment.dispute.created',
  'payment.dispute.won',
  'payment.dispute.lost',
  'payment.dispute.closed',
  'payment.dispute.under_review',
  'payment.dispute.action_required',
  'payment.downtime.started',
  'payment.downtime.updated',
  'payment.downtime.resolved',
  'order.paid',
  'order.notification.delivered',
  'order.notification.failed',
  'invoice.paid',
  'invoice.partially_paid',
  'invoice.expired',
  'subscription.authenticated',
  'subscription.paused',
  'subscription.resumed',
  'subscription.activated',
  'subscription.pending',
  'subscription.halted',
  'subscription.charged',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.updated',
  'settlement.processed',
  'qr_code.closed',
  'qr_code.created',
  'qr_code.credited',
  'fund_account.validation.completed',
  'fund_account.validation.failed',
  'refund.speed_changed',
  'refund.processed',
  'refund.failed',
  'refund.created',
  'account.instantly_activated',
  'account.activated_kyc_pending',
  'payment_link.paid',
  'payment_link.partially_paid',
  'payment_link.expired',
  'payment_link.cancelled',
] as const;
const developerApiScopeSet = new Set<string>(DEVELOPER_API_SCOPES);
const developerWebhookEventSet = new Set<string>(DEVELOPER_WEBHOOK_EVENTS);
const razorpayTrackedWebhookEventSet = new Set<string>(RAZORPAY_TRACKED_WEBHOOK_EVENTS);
const WOOCOMMERCE_AUTOMATION_IDS: WooCommerceAutomationId[] = [
  'abandoned-recovery',
  'order-confirmation',
  'order-fulfilled',
  'purchase-follow-up',
  'return-exchange',
];
const woocommerceAutomationIdSet = new Set<string>(WOOCOMMERCE_AUTOMATION_IDS);

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase server environment. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const encryptionKey = tokenEncryptionSecret
  ? crypto.createHash('sha256').update(tokenEncryptionSecret).digest()
  : null;

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 64 * 1024 * 1024,
  },
});
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', frontendOrigin);
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Connektly-Api-Key, X-Connektly-Api-Secret');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(
  TEMPLATE_HEADER_MEDIA_ROUTE,
  express.static(templateHeaderMediaDir, {
    fallthrough: true,
    immutable: true,
    maxAge: '30d',
  }),
);
app.use(
  TEMPLATE_HEADER_MEDIA_API_ROUTE,
  express.static(templateHeaderMediaDir, {
    fallthrough: true,
    immutable: true,
    maxAge: '30d',
  }),
);
app.get([`${TEMPLATE_HEADER_MEDIA_ROUTE}/*`, `${TEMPLATE_HEADER_MEDIA_API_ROUTE}/*`], (_req, res) => {
  res
    .status(200)
    .type('image/png')
    .set('Cache-Control', 'public, max-age=300')
    .send(transparentPng);
});

interface RazorpayPlanEntity {
  id: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  item: {
    amount: number;
    currency: string;
    name?: string;
    description?: string;
  };
  notes?: Record<string, string>;
}

interface RazorpaySubscriptionEntity {
  id: string;
  status: string;
  plan_id: string;
  customer_id?: string;
  start_at?: number;
  charge_at?: number;
  notes?: Record<string, string>;
}

interface RazorpayOrderEntity {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
  notes?: Record<string, string>;
}

interface RazorpayPaymentEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  notes?: Record<string, string>;
}

function requireRazorpayCredentials() {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error(
      'Razorpay is not configured on the API server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }
}

function normalizeCouponCode(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const next = value.trim().toUpperCase();
  return next || null;
}

function parseCouponValue(raw: unknown) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function parseRazorpayCoupons(raw: string | undefined) {
  const coupons = new Map<string, BillingCouponDefinition>();

  if (!raw?.trim()) {
    return coupons;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    for (const [couponCode, value] of Object.entries(parsed || {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const record = value as Record<string, unknown>;
      const normalizedCode = normalizeCouponCode(couponCode);
      const kind =
        record.kind === 'percent' || record.type === 'percent'
          ? 'percent'
          : record.kind === 'flat' || record.type === 'flat'
            ? 'flat'
            : null;
      const parsedValue = parseCouponValue(record.value);

      if (!normalizedCode || !kind || parsedValue === null || parsedValue <= 0) {
        continue;
      }

      coupons.set(normalizedCode, {
        code: normalizedCode,
        kind,
        value: parsedValue,
        description:
          typeof record.description === 'string' && record.description.trim()
            ? record.description.trim()
            : undefined,
      });
    }
  } catch (error) {
    console.error('Failed to parse RAZORPAY_COUPONS_JSON:', error);
  }

  return coupons;
}

const razorpayCoupons = parseRazorpayCoupons(process.env.RAZORPAY_COUPONS_JSON);

function getBillingTrialDays() {
  return Number.isFinite(razorpayTrialDays) && razorpayTrialDays >= 0
    ? Math.round(razorpayTrialDays)
    : BILLING_DEFAULT_TRIAL_DAYS;
}

function getRazorpaySubscriptionTotalCount(cycle: BillingCycle) {
  const raw = cycle === 'annual' ? razorpayAnnualTotalCount : razorpayMonthlyTotalCount;
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : cycle === 'annual' ? 10 : 120;
}

function resolveBillingCoupon(couponCode?: string | null) {
  const normalizedCode = normalizeCouponCode(couponCode);

  if (!normalizedCode) {
    return null;
  }

  const coupon = razorpayCoupons.get(normalizedCode);

  if (!coupon) {
    throw new Error('Invalid or expired coupon code.');
  }

  return coupon;
}

async function loadBillingPlans(): Promise<BillingPlanDefinition[]> {
  try {
    const { data, error } = await adminSupabase
      .from('user_platform_settings')
      .select('settings')
      .eq('section', 'pricing_plans')
      .maybeSingle();

    if (error) {
      console.warn('Falling back to bundled billing plans:', error.message);
      return mapPlatformPricingPlans([]);
    }

    const settings = data && typeof data === 'object' && 'settings' in data ? data.settings : null;
    const plans = settings && typeof settings === 'object' && 'plans' in settings
      ? (settings.plans as PlatformPricingPlanDefinition[])
      : [];

    return mapPlatformPricingPlans(Array.isArray(plans) ? plans : []);
  } catch (error) {
    console.warn('Falling back to bundled billing plans:', error);
    return mapPlatformPricingPlans([]);
  }
}

async function getBillingQuote(input: BillingQuoteInput) {
  const plans = await loadBillingPlans();
  const plan = getBillingPlan(input.planCode as BillingPlanCode, plans);

  if (!plan) {
    throw new Error('Unsupported plan selected.');
  }

  const billingCycle = normalizeBillingCycle(input.billingCycle as string);

  if (!billingCycle) {
    throw new Error('Billing cycle must be monthly or annual.');
  }

  const coupon = resolveBillingCoupon(input.couponCode);
  const quote = buildBillingSummary({
    planCode: plan.code,
    billingCycle,
    coupon,
    trialDays: getBillingTrialDays(),
    plans,
  });

  return {
    plan,
    plans,
    billingCycle,
    coupon,
    quote,
  };
}

function buildRazorpayCatalogKey(input: { planCode: BillingPlanCode; billingCycle: BillingCycle; couponCode?: string | null; totalAmount: number }) {
  const couponSegment = normalizeCouponCode(input.couponCode)?.toLowerCase() || 'standard';
  return `connektly_${input.planCode}_${input.billingCycle}_${couponSegment}_${input.totalAmount}`;
}

async function razorpayRequest<T>(pathname: string, init?: RequestInit) {
  requireRazorpayCredentials();

  const response = await fetch(`https://api.razorpay.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage =
      payload?.error?.description ||
      payload?.description ||
      payload?.message ||
      `Razorpay request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

async function fetchAllRazorpayPlans() {
  const plans: RazorpayPlanEntity[] = [];
  const count = 100;
  let skip = 0;

  while (true) {
    const response = await razorpayRequest<{ items: RazorpayPlanEntity[] }>(
      `/v1/plans?count=${count}&skip=${skip}`,
      {
        method: 'GET',
      },
    );

    plans.push(...(response.items || []));

    if ((response.items || []).length < count) {
      break;
    }

    skip += count;
  }

  return plans;
}

async function getOrCreateRazorpayPlan(input: {
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string | null;
  quote: Awaited<ReturnType<typeof getBillingQuote>>['quote'];
}) {
  const catalogKey = buildRazorpayCatalogKey({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode,
    totalAmount: input.quote.totalAmount,
  });

  const existingPlans = await fetchAllRazorpayPlans();
  const existingPlan = existingPlans.find((plan) => plan.notes?.catalog_key === catalogKey);

  if (existingPlan) {
    return existingPlan;
  }

  return razorpayRequest<RazorpayPlanEntity>('/v1/plans', {
    method: 'POST',
    body: JSON.stringify({
      period: input.billingCycle === 'annual' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: `${razorpayBusinessName} ${input.quote.planName}`,
        description: `${input.quote.planName} subscription billed ${input.quote.billingCycleLabel.toLowerCase()} with 18% GST included.`,
        amount: input.quote.totalAmount,
        currency: BILLING_CURRENCY,
      },
      notes: {
        catalog_key: catalogKey,
        plan_code: input.planCode,
        billing_cycle: input.billingCycle,
        coupon_code: normalizeCouponCode(input.couponCode) || '',
        base_amount: String(input.quote.baseAmount),
        discount_amount: String(input.quote.discountAmount),
        gst_amount: String(input.quote.gstAmount),
        total_amount: String(input.quote.totalAmount),
      },
    }),
  });
}

async function createRazorpaySubscription(input: {
  userId: string;
  userEmail: string | null | undefined;
  planCode: BillingPlanCode;
  billingCycle: BillingCycle;
  couponCode?: string | null;
}) {
  const { quote } = await getBillingQuote({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode || undefined,
  });

  const plan = await getOrCreateRazorpayPlan({
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    couponCode: input.couponCode,
    quote,
  });

  const subscription = await razorpayRequest<RazorpaySubscriptionEntity>('/v1/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: plan.id,
      total_count: getRazorpaySubscriptionTotalCount(input.billingCycle),
      customer_notify: 0,
      start_at: Math.floor(new Date(quote.trialEndsAt).getTime() / 1000),
      notes: {
        user_id: input.userId,
        user_email: input.userEmail || '',
        plan_code: input.planCode,
        billing_cycle: input.billingCycle,
        coupon_code: normalizeCouponCode(input.couponCode) || '',
        trial_ends_at: quote.trialEndsAt,
        total_amount: String(quote.totalAmount),
      },
    }),
  });

  return {
    subscription,
    quote,
  };
}

async function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscriptionEntity>(`/v1/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
}

async function createRazorpayOrder(input: {
  userId: string;
  walletId: string;
  transactionId: string;
  amount: number;
  currency: string;
}) {
  return razorpayRequest<RazorpayOrderEntity>('/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: majorAmountToMinorUnits(input.amount),
      currency: normalizeCurrencyCode(input.currency),
      receipt: `wallet_${input.transactionId.slice(0, 32)}`,
      notes: {
        user_id: input.userId,
        wallet_id: input.walletId,
        transaction_id: input.transactionId,
      },
    }),
  });
}

function verifyRazorpaySubscriptionSignature(args: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}) {
  requireRazorpayCredentials();

  const expectedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${args.paymentId}|${args.subscriptionId}`)
    .digest('hex');

  if (expectedSignature !== args.signature) {
    throw new Error('Razorpay payment signature verification failed.');
  }
}

function resolvePersistedBillingStatus(subscription: RazorpaySubscriptionEntity, trialEndsAt: string | null) {
  const trialIsActive = Boolean(trialEndsAt && new Date(trialEndsAt).getTime() > Date.now());

  if (trialIsActive) {
    return 'trialing' as const;
  }

  if (subscription.status === 'active' || subscription.status === 'authenticated') {
    return 'active' as const;
  }

  if (subscription.status === 'halted' || subscription.status === 'cancelled' || subscription.status === 'completed') {
    return 'inactive' as const;
  }

  return 'inactive' as const;
}

function normalizeCurrencyCode(value: unknown, fallback = 'USD') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

function majorAmountToMinorUnits(value: number) {
  return Math.max(Math.round(value * 100), 0);
}

function getWalletFeatureFlags(): WalletFeatureFlags {
  return {
    enablePlatformWallet,
    enableCampaignEstimator,
    enableWabaCreditBilling,
    enablePartnerBillingMode,
  };
}

function getDefaultWalletType(): WalletType {
  if (enableWabaCreditBilling && enablePartnerBillingMode) {
    return 'partner_managed_waba';
  }

  if (enableCampaignEstimator && !enablePlatformWallet) {
    return 'campaign_estimate';
  }

  return 'platform';
}

function normalizeWalletType(value: unknown): WalletType {
  return value === 'campaign_estimate' || value === 'partner_managed_waba' || value === 'platform'
    ? value
    : getDefaultWalletType();
}

function normalizeWalletTransactionType(value: unknown): WalletTransactionType {
  return value === 'credit' || value === 'debit' || value === 'refund' || value === 'adjustment'
    ? value
    : 'adjustment';
}

function normalizeWalletTransactionSource(value: unknown): WalletTransactionSource {
  return value === 'razorpay' || value === 'stripe' || value === 'manual' || value === 'system'
    ? value
    : 'system';
}

function normalizeWalletTransactionPurpose(value: unknown): WalletTransactionPurpose {
  return value === 'subscription' || value === 'addon' || value === 'campaign_estimate' || value === 'waba_billing'
    ? value
    : 'addon';
}

function normalizeWalletTransactionStatus(value: unknown): WalletTransactionStatus {
  return value === 'pending' || value === 'successful' || value === 'failed' || value === 'refunded'
    ? value
    : 'pending';
}

function isWalletRechargeEnabled() {
  return enablePlatformWallet && Boolean(razorpayKeyId && razorpayKeySecret);
}

function buildEmptyWalletSummary(preferredCurrency?: string | null): WalletSummary {
  const currency = normalizeCurrencyCode(preferredCurrency || 'USD');

  return {
    id: null,
    userId: null,
    orgId: null,
    currency,
    preferredCurrency: normalizeCurrencyCode(preferredCurrency || currency),
    availableBalance: 0,
    lockedBalance: 0,
    walletType: getDefaultWalletType(),
    rechargeEnabled: isWalletRechargeEnabled(),
    pricingOverviewUrl: walletPricingOverviewUrl,
    featureFlags: getWalletFeatureFlags(),
    transactions: [],
  };
}

function mapWalletTransaction(row: Record<string, unknown>): WalletTransaction {
  const metadata = isRecord(row.metadata) ? row.metadata : {};

  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
    description: normalizeOptionalString(row.description) || 'Wallet activity',
    type: normalizeWalletTransactionType(row.type),
    source: normalizeWalletTransactionSource(row.source),
    purpose: normalizeWalletTransactionPurpose(row.purpose),
    status: normalizeWalletTransactionStatus(row.status),
    amount: Number(row.amount || 0),
    currency: normalizeCurrencyCode(row.currency),
    externalReference: normalizeOptionalString(row.external_reference),
    metadata,
  };
}

function mapWalletSummary(
  row: Record<string, unknown> | null,
  preferredCurrency: string | null,
  transactions: WalletTransaction[],
): WalletSummary {
  if (!row) {
    return buildEmptyWalletSummary(preferredCurrency);
  }

  return {
    id: String(row.id),
    userId: normalizeOptionalIdentifier(row.user_id),
    orgId: normalizeOptionalIdentifier(row.org_id),
    currency: normalizeCurrencyCode(row.currency),
    preferredCurrency: preferredCurrency ? normalizeCurrencyCode(preferredCurrency) : null,
    availableBalance: Number(row.available_balance || 0),
    lockedBalance: Number(row.locked_balance || 0),
    walletType: normalizeWalletType(row.wallet_type),
    rechargeEnabled: isWalletRechargeEnabled(),
    pricingOverviewUrl: walletPricingOverviewUrl,
    featureFlags: getWalletFeatureFlags(),
    transactions,
  };
}

async function resolveWorkspaceOwnerUserId(userId: string) {
  const membershipResult = await adminSupabase
    .from('workspace_team_members')
    .select('workspace_owner_user_id')
    .eq('member_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipResult.error && !isMissingSchemaError(membershipResult.error)) {
    throw membershipResult.error;
  }

  const ownerUserId = normalizeOptionalIdentifier(membershipResult.data?.workspace_owner_user_id);
  return ownerUserId || userId;
}

async function getProfilePreferredCurrency(userId: string) {
  const profileResult = await adminSupabase
    .from('app_profiles')
    .select('preferred_currency')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileResult.error && !isMissingSchemaError(profileResult.error)) {
    throw profileResult.error;
  }

  return normalizeOptionalString(profileResult.data?.preferred_currency)
    ? normalizeCurrencyCode(profileResult.data?.preferred_currency)
    : null;
}

async function backfillWalletFromLegacyLedger(orgId: string, preferredCurrency: string | null) {
  const legacyLedgerResult = await adminSupabase
    .from('credit_ledger')
    .select('*')
    .eq('user_id', orgId)
    .order('created_at', { ascending: true });

  if (legacyLedgerResult.error && !isMissingSchemaError(legacyLedgerResult.error)) {
    throw legacyLedgerResult.error;
  }

  const legacyRows = ((legacyLedgerResult.data || []) as Record<string, unknown>[]) || [];

  if (legacyRows.length === 0) {
    return null;
  }

  const walletCurrency = normalizeCurrencyCode(
    legacyRows[legacyRows.length - 1]?.currency || preferredCurrency || 'USD',
  );
  const availableBalance = legacyRows.reduce((current, row) => {
    const amount = Number(row.amount || 0);
    return row.type === 'addition' ? current + amount : current - amount;
  }, 0);

  const createdWalletResult = await adminSupabase
    .from('wallets')
    .insert({
      user_id: orgId,
      org_id: orgId,
      currency: walletCurrency,
      available_balance: availableBalance,
      locked_balance: 0,
      wallet_type: getDefaultWalletType(),
    })
    .select('*')
    .single();

  if (createdWalletResult.error) {
    throw createdWalletResult.error;
  }

  const createdWallet = createdWalletResult.data as Record<string, unknown>;
  const transactionPayload = legacyRows.map((row) => ({
    wallet_id: createdWallet.id,
    amount: Number(row.amount || 0),
    currency: walletCurrency,
    type: row.type === 'addition' ? 'credit' : 'debit',
    source: 'system',
    purpose: 'campaign_estimate',
    status: 'successful',
    description: normalizeOptionalString(row.description) || 'Legacy credit ledger migration',
    metadata: {
      migratedFrom: 'credit_ledger',
      legacyCreditLedgerId: normalizeOptionalIdentifier(row.id),
      legacyCreatedAt: row.created_at,
    },
    created_at: row.created_at,
    updated_at: row.created_at,
  }));

  if (transactionPayload.length > 0) {
    const transactionInsertResult = await adminSupabase.from('transactions').insert(transactionPayload);

    if (transactionInsertResult.error) {
      throw transactionInsertResult.error;
    }
  }

  return createdWallet;
}

async function ensureWalletForUser(userId: string, preferredCurrency: string | null) {
  const orgId = await resolveWorkspaceOwnerUserId(userId);
  const ownerPreferredCurrency = await getProfilePreferredCurrency(orgId);
  const targetCurrency = normalizeCurrencyCode(ownerPreferredCurrency || preferredCurrency || 'USD');
  const walletType = getDefaultWalletType();

  const existingWalletResult = await adminSupabase
    .from('wallets')
    .select('*')
    .eq('org_id', orgId)
    .eq('wallet_type', walletType)
    .maybeSingle();

  if (existingWalletResult.error && !isMissingSchemaError(existingWalletResult.error)) {
    throw existingWalletResult.error;
  }

  if (isMissingSchemaError(existingWalletResult.error)) {
    return null;
  }

  const existingWallet = (existingWalletResult.data as Record<string, unknown> | null) || null;

  if (existingWallet) {
    const currentCurrency = normalizeCurrencyCode(existingWallet.currency);
    const currentAvailable = Number(existingWallet.available_balance || 0);
    const currentLocked = Number(existingWallet.locked_balance || 0);

    if (currentCurrency !== targetCurrency && currentAvailable === 0 && currentLocked === 0) {
      const updatedWalletResult = await adminSupabase
        .from('wallets')
        .update({
          currency: targetCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingWallet.id)
        .select('*')
        .single();

      if (updatedWalletResult.error) {
        throw updatedWalletResult.error;
      }

      return updatedWalletResult.data as Record<string, unknown>;
    }

    return existingWallet;
  }

  const migratedWallet = await backfillWalletFromLegacyLedger(orgId, targetCurrency);

  if (migratedWallet) {
    return migratedWallet;
  }

  const createdWalletResult = await adminSupabase
    .from('wallets')
    .insert({
      user_id: orgId,
      org_id: orgId,
      currency: targetCurrency,
      available_balance: 0,
      locked_balance: 0,
      wallet_type: walletType,
    })
    .select('*')
    .single();

  if (createdWalletResult.error) {
    throw createdWalletResult.error;
  }

  return createdWalletResult.data as Record<string, unknown>;
}

async function getWalletForUser(user: User): Promise<WalletSummary> {
  const preferredCurrency = await getProfilePreferredCurrency(user.id);
  const walletRow = await ensureWalletForUser(user.id, preferredCurrency);

  if (!walletRow) {
    return buildEmptyWalletSummary(preferredCurrency);
  }

  const transactionsResult = await adminSupabase
    .from('transactions')
    .select('*')
    .eq('wallet_id', walletRow.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (transactionsResult.error && !isMissingSchemaError(transactionsResult.error)) {
    throw transactionsResult.error;
  }

  const transactions = (((transactionsResult.data || []) as Record<string, unknown>[]) || []).map((row) =>
    mapWalletTransaction(row),
  );

  return mapWalletSummary(walletRow, preferredCurrency, transactions);
}

function buildWalletTopupDescription(amount: number, currency: string) {
  return `Platform wallet top-up of ${currency} ${amount.toFixed(2)}`;
}

async function createWalletTransaction(input: {
  walletId: string;
  amount: number;
  currency: string;
  type: WalletTransactionType;
  source: WalletTransactionSource;
  purpose: WalletTransactionPurpose;
  status: WalletTransactionStatus;
  description: string;
  externalReference?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await adminSupabase
    .from('transactions')
    .insert({
      wallet_id: input.walletId,
      amount: input.amount,
      currency: normalizeCurrencyCode(input.currency),
      type: input.type,
      source: input.source,
      purpose: input.purpose,
      status: input.status,
      description: input.description,
      external_reference: input.externalReference ?? null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function fetchRazorpayPayment(paymentId: string) {
  return razorpayRequest<RazorpayPaymentEntity>(`/v1/payments/${paymentId}`, {
    method: 'GET',
  });
}

function verifyRazorpayOrderSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  requireRazorpayCredentials();

  const expectedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${args.orderId}|${args.paymentId}`)
    .digest('hex');

  if (expectedSignature !== args.signature) {
    throw new Error('Razorpay payment signature verification failed.');
  }
}

function requireRazorpayWebhookSecret() {
  if (!razorpayWebhookSecret) {
    throw new Error(
      'Razorpay webhook validation is not configured. Set RAZORPAY_WEBHOOK_SECRET to the secret from the Razorpay Dashboard webhook.',
    );
  }
}

function verifyRazorpayWebhookSignature(req: Request) {
  requireRazorpayWebhookSecret();

  const signature = normalizeOptionalString(req.header('x-razorpay-signature'));

  if (!signature || !req.rawBody) {
    throw new Error('Razorpay webhook signature is missing.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', razorpayWebhookSecret)
    .update(req.rawBody)
    .digest('hex');

  if (!timingSafeCompareHex(expectedSignature, signature)) {
    throw new Error('Razorpay webhook signature is invalid.');
  }
}

function normalizeRazorpayWebhookTimestamp(value: unknown) {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;

  if (numeric !== null && numeric > 0) {
    return new Date(numeric * 1000).toISOString();
  }

  const raw = normalizeOptionalString(value);
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRazorpayPayloadRecord(payload: Record<string, unknown>) {
  return isRecord(payload.payload) ? (payload.payload as Record<string, unknown>) : {};
}

function getRazorpayPayloadEntity(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const payloadRecord = getRazorpayPayloadRecord(payload);
  const wrapper = payloadRecord[key];

  if (!isRecord(wrapper)) {
    return null;
  }

  return isRecord(wrapper.entity) ? (wrapper.entity as Record<string, unknown>) : null;
}

function getPrimaryRazorpayEntity(payload: Record<string, unknown>, eventName: string) {
  const eventRoot = eventName.split('.')[0];
  const candidates = new Set<string>([
    eventRoot,
    'payment',
    'order',
    'invoice',
    'subscription',
    'settlement',
    'qr_code',
    'fund_account',
    'refund',
    'account',
    'payment_link',
  ]);

  if (eventName.startsWith('payment.dispute.')) {
    candidates.add('dispute');
  }

  if (eventName.startsWith('payment.downtime.')) {
    candidates.add('payment_downtime');
  }

  for (const candidate of candidates) {
    const entity = getRazorpayPayloadEntity(payload, candidate);
    if (entity) {
      return {
        type: candidate,
        entity,
      };
    }
  }

  const payloadRecord = getRazorpayPayloadRecord(payload);
  for (const [key, wrapper] of Object.entries(payloadRecord)) {
    if (isRecord(wrapper) && isRecord(wrapper.entity)) {
      return {
        type: key,
        entity: wrapper.entity as Record<string, unknown>,
      };
    }
  }

  return {
    type: null,
    entity: null,
  };
}

function getRazorpayEntityNotes(entity: Record<string, unknown> | null) {
  return entity && isRecord(entity.notes) ? (entity.notes as Record<string, unknown>) : null;
}

function getRazorpayWebhookNotes(payload: Record<string, unknown>) {
  const payloadRecord = getRazorpayPayloadRecord(payload);
  const notes: Record<string, unknown>[] = [];

  for (const wrapper of Object.values(payloadRecord)) {
    if (!isRecord(wrapper) || !isRecord(wrapper.entity)) {
      continue;
    }

    const entityNotes = getRazorpayEntityNotes(wrapper.entity as Record<string, unknown>);
    if (entityNotes) {
      notes.push(entityNotes);
    }
  }

  return notes;
}

function getRazorpayWebhookIdentifiers(payload: Record<string, unknown>, eventName: string) {
  const primary = getPrimaryRazorpayEntity(payload, eventName);
  const payment = getRazorpayPayloadEntity(payload, 'payment');
  const order = getRazorpayPayloadEntity(payload, 'order');
  const subscription = getRazorpayPayloadEntity(payload, 'subscription');
  const invoice = getRazorpayPayloadEntity(payload, 'invoice');
  const refund = getRazorpayPayloadEntity(payload, 'refund');
  const settlement = getRazorpayPayloadEntity(payload, 'settlement');
  const entity = primary.entity;

  return {
    entityType: primary.type,
    entityId: normalizeOptionalIdentifier(entity?.id),
    paymentId:
      normalizeOptionalIdentifier(payment?.id) ||
      normalizeOptionalIdentifier(entity?.payment_id) ||
      (primary.type === 'payment' ? normalizeOptionalIdentifier(entity?.id) : null),
    orderId:
      normalizeOptionalIdentifier(order?.id) ||
      normalizeOptionalIdentifier(entity?.order_id) ||
      (primary.type === 'order' ? normalizeOptionalIdentifier(entity?.id) : null),
    subscriptionId:
      normalizeOptionalIdentifier(subscription?.id) ||
      normalizeOptionalIdentifier(entity?.subscription_id) ||
      (primary.type === 'subscription' ? normalizeOptionalIdentifier(entity?.id) : null),
    invoiceId:
      normalizeOptionalIdentifier(invoice?.id) ||
      normalizeOptionalIdentifier(entity?.invoice_id) ||
      (primary.type === 'invoice' ? normalizeOptionalIdentifier(entity?.id) : null),
    refundId:
      normalizeOptionalIdentifier(refund?.id) ||
      normalizeOptionalIdentifier(entity?.refund_id) ||
      (primary.type === 'refund' ? normalizeOptionalIdentifier(entity?.id) : null),
    settlementId:
      normalizeOptionalIdentifier(settlement?.id) ||
      normalizeOptionalIdentifier(entity?.settlement_id) ||
      (primary.type === 'settlement' ? normalizeOptionalIdentifier(entity?.id) : null),
  };
}

async function resolveRazorpayWebhookUserId(
  payload: Record<string, unknown>,
  identifiers: ReturnType<typeof getRazorpayWebhookIdentifiers>,
) {
  const notesUserId = getRazorpayWebhookNotes(payload)
    .map((notes) => normalizeOptionalIdentifier(notes.user_id))
    .find((userId): userId is string => Boolean(userId));

  if (notesUserId) {
    return notesUserId;
  }

  if (identifiers.subscriptionId) {
    const { data, error } = await adminSupabase
      .from('app_profiles')
      .select('user_id')
      .eq('razorpay_subscription_id', identifiers.subscriptionId)
      .maybeSingle();

    if (error && !isMissingSchemaError(error)) {
      throw error;
    }

    const userId = normalizeOptionalIdentifier(data?.user_id);
    if (userId) {
      return userId;
    }
  }

  const externalReferences = [identifiers.orderId, identifiers.paymentId].filter(
    (value): value is string => Boolean(value),
  );

  for (const externalReference of externalReferences) {
    const { data: transaction, error: transactionError } = await adminSupabase
      .from('transactions')
      .select('wallet_id')
      .eq('external_reference', externalReference)
      .maybeSingle();

    if (transactionError && !isMissingSchemaError(transactionError)) {
      throw transactionError;
    }

    const walletId = normalizeOptionalIdentifier(transaction?.wallet_id);
    if (!walletId) {
      continue;
    }

    const { data: wallet, error: walletError } = await adminSupabase
      .from('wallets')
      .select('user_id, org_id')
      .eq('id', walletId)
      .maybeSingle();

    if (walletError && !isMissingSchemaError(walletError)) {
      throw walletError;
    }

    const userId = normalizeOptionalIdentifier(wallet?.org_id) || normalizeOptionalIdentifier(wallet?.user_id);
    if (userId) {
      return userId;
    }
  }

  return null;
}

async function insertRazorpayWebhookEvent(req: Request, payload: Record<string, unknown>) {
  const eventName = normalizeOptionalString(payload.event);

  if (!eventName) {
    throw new Error('Razorpay webhook event name is missing.');
  }

  if (!razorpayTrackedWebhookEventSet.has(eventName)) {
    return {
      tracked: false,
      eventName,
      duplicate: false,
    };
  }

  const eventId =
    normalizeOptionalString(req.header('x-razorpay-event-id')) ||
    normalizeOptionalString(payload.id);
  const identifiers = getRazorpayWebhookIdentifiers(payload, eventName);
  const userId = await resolveRazorpayWebhookUserId(payload, identifiers);
  const { error } = await adminSupabase
    .from('razorpay_webhook_events')
    .insert({
      user_id: userId,
      event_id: eventId,
      event_name: eventName,
      account_id: normalizeOptionalIdentifier(payload.account_id),
      entity_type: identifiers.entityType,
      entity_id: identifiers.entityId,
      payment_id: identifiers.paymentId,
      order_id: identifiers.orderId,
      subscription_id: identifiers.subscriptionId,
      invoice_id: identifiers.invoiceId,
      refund_id: identifiers.refundId,
      settlement_id: identifiers.settlementId,
      event_created_at: normalizeRazorpayWebhookTimestamp(payload.created_at),
      payload,
    });

  if (error) {
    if (error.code === '23505') {
      return {
        tracked: true,
        eventName,
        duplicate: true,
      };
    }

    throw error;
  }

  return {
    tracked: true,
    eventName,
    duplicate: false,
  };
}

async function startFreeTrial(user: User) {
  const existing = await adminSupabase
    .from('app_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const existingProfile = existing.data ? mapProfile(existing.data as Record<string, unknown>) : null;

  if (hasUsedFreeTrial(existingProfile)) {
    throw new Error('Your 7-day free trial has already been used. Choose a paid plan to continue.');
  }

  const trialStartedAt = new Date();
  const trialEndsAt = computeFreeTrialEndsAt(trialStartedAt);

  return upsertProfile(user, {
    selectedPlan: 'Trial',
    billingCycle: null,
    billingStatus: 'trialing',
    trialEndsAt: trialEndsAt.toISOString(),
    freeTrialStartedAt: trialStartedAt.toISOString(),
    couponCode: null,
    razorpaySubscriptionId: null,
  });
}

function mapDbError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : error && typeof error === 'object' && 'error_description' in error && typeof error.error_description === 'string'
            ? error.error_description
            : error && typeof error === 'object' && 'details' in error && typeof error.details === 'string'
              ? error.details
              : JSON.stringify(error);
  const missingSchema =
    typeof message === 'string' &&
    ((message.includes('does not exist') && message.includes('relation')) ||
      message.includes('Could not find the table'));

  if (missingSchema) {
    return 'Supabase tables are missing. Apply supabase/schema.sql before starting the API server.';
  }

  return message;
}

function isMissingSchemaError(error: unknown) {
  const message = mapDbError(error);
  return (
    message ===
    'Supabase tables are missing. Apply supabase/schema.sql before starting the API server.'
  );
}

function sendError(res: Response, status: number, error: unknown) {
  console.error('API error:', error);
  res.status(status).json({
    error: mapDbError(error),
  });
}

function encryptSecretValue(value: string) {
  if (!encryptionKey) {
    return value;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecretValue(value: string) {
  if (!value.startsWith('enc:') || !encryptionKey) {
    return value;
  }

  const [iv, tag, payload] = value.slice(4).split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function encryptAccessToken(token: string) {
  return encryptSecretValue(token);
}

function decryptAccessToken(value: string) {
  return decryptSecretValue(value);
}

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const apiKey = normalizeOptionalString(req.header('x-connektly-api-key'));
  const apiSecret = normalizeOptionalString(req.header('x-connektly-api-secret'));

  if (apiKey || apiSecret) {
    try {
      if (!apiKey || !apiSecret) {
        throw new Error('Both X-Connektly-Api-Key and X-Connektly-Api-Secret are required.');
      }

      const requiredScope = getDeveloperApiRequiredScope(req);

      if (!requiredScope) {
        res.status(403).json({ error: 'This endpoint requires a signed-in dashboard session.' });
        return;
      }

      const { data, error } = await adminSupabase
        .from('developer_api_credentials')
        .select('*')
        .eq('api_key', apiKey)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !data) {
        throw error || new Error('Invalid API key credentials.');
      }

      const credential = mapDeveloperApiCredential(data as Record<string, unknown>);
      const secretHash = String((data as Record<string, unknown>).secret_hash || '');
      const providedSecretHash = hashDeveloperSecret(apiSecret);

      if (!secretHash || !timingSafeCompareHex(secretHash, providedSecretHash)) {
        throw new Error('Invalid API key credentials.');
      }

      if (!credential.scopes.includes(requiredScope)) {
        res.status(403).json({ error: `API key is missing the ${requiredScope} scope.` });
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await adminSupabase.auth.admin.getUserById(credential.userId);

      if (userError || !user) {
        throw userError || new Error('API key owner was not found.');
      }

      const lastUsedResult = await adminSupabase
        .from('developer_api_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', credential.id);

      if (lastUsedResult.error) {
        console.error('Failed to update API key last_used_at:', lastUsedResult.error);
      }

      req.authedUser = user;
      req.developerApiCredential = credential;
      next();
      return;
    } catch (error) {
      res.status(401).json({
        error: mapDbError(error),
      });
      return;
    }
  }

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }

  const token = header.slice('Bearer '.length);
  const {
    data: { user },
    error,
  } = await authSupabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid Supabase session.' });
    return;
  }

  await activatePendingWorkspaceMembership(user.id);
  req.authedUser = user;
  next();
}

async function activatePendingWorkspaceMembership(userId: string) {
  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .update({
      status: 'active',
      accepted_at: new Date().toISOString(),
    })
    .eq('member_user_id', userId)
    .eq('status', 'invited')
    .select('*');

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  for (const row of data || []) {
    const membership = row as Record<string, unknown>;
    const ownerUserId = normalizeOptionalIdentifier(membership.workspace_owner_user_id);

    if (!ownerUserId || ownerUserId === userId) {
      continue;
    }

    const memberName =
      normalizeOptionalString(membership.full_name) ||
      normalizeOptionalString(membership.invited_email) ||
      'A team member';

    await createUserNotification({
      userId: ownerUserId,
      type: 'team_member_joined',
      title: 'A user joined your workspace',
      body: `${memberName} accepted the invite and now has access to the workspace.`,
      targetPath: '/dashboard/settings?tab=team',
      metadata: {
        memberUserId: normalizeOptionalIdentifier(membership.member_user_id),
        email: normalizeOptionalString(membership.invited_email),
        role: normalizeOptionalString(membership.role),
      },
      dedupeKey: `team-joined:${String(membership.id)}:${String(membership.accepted_at || '')}`,
    });
  }
}

function requireMetaAppCredentials() {
  if (!metaAppId || !metaAppSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured on the API server.');
  }
}

function last4(value: string) {
  return value.length >= 4 ? value.slice(-4) : value;
}

function toIsoTimestamp(raw: string | number | null | undefined) {
  if (!raw) {
    return null;
  }

  const numeric = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) * 1000 : Number(raw);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(value: string | null | undefined): ConversationThread['status'] {
  return normalizeConversationThreadStatus(value);
}

function normalizePriority(value: string | null | undefined): ConversationThread['priority'] {
  if (value === 'Low' || value === 'High') {
    return value;
  }

  return 'Medium';
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalIdentifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeOptionalString(value);
}

function generateDeveloperToken(prefix: string, byteLength = 24) {
  return `${prefix}_${crypto.randomBytes(byteLength).toString('hex')}`;
}

function hashDeveloperSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeDeveloperApiScopes(value: unknown): DeveloperApiScope[] {
  if (!Array.isArray(value)) {
    return [...DEVELOPER_API_SCOPES];
  }

  const scopes = value.filter((scope): scope is DeveloperApiScope => {
    return typeof scope === 'string' && developerApiScopeSet.has(scope);
  });

  if (scopes.length === 0) {
    throw new Error('Select at least one API permission scope.');
  }

  return Array.from(new Set(scopes));
}

function normalizeDeveloperWebhookEvents(value: unknown): DeveloperWebhookEvent[] {
  if (!Array.isArray(value)) {
    throw new Error('Select at least one webhook event.');
  }

  const events = value.filter((event): event is DeveloperWebhookEvent => {
    return typeof event === 'string' && developerWebhookEventSet.has(event);
  });

  if (events.length === 0) {
    throw new Error('Select at least one webhook event.');
  }

  return Array.from(new Set(events));
}

function normalizeDeveloperWebhookUrl(value: unknown) {
  const rawUrl = normalizeOptionalString(value);

  if (!rawUrl) {
    throw new Error('Webhook URL is required.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('Enter a valid webhook URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Webhook URL must use HTTP or HTTPS.');
  }

  return parsedUrl.toString();
}

function normalizeDeveloperWebhookStatus(value: unknown, fallback: DeveloperWebhookEndpoint['status']) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value === 'active' || value === 'paused') {
    return value;
  }

  throw new Error('Webhook status must be active or paused.');
}

function getDeveloperApiRequiredScope(req: Request): DeveloperApiScope | null {
  const routePath = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  if (routePath.startsWith('/conversations')) {
    return method === 'GET' || method === 'HEAD' ? 'messages:read' : 'messages:write';
  }

  if (routePath.startsWith('/contacts')) {
    return method === 'GET' || method === 'HEAD' ? 'contacts:read' : 'contacts:write';
  }

  if (routePath.startsWith('/developer/webhooks')) {
    return 'webhooks:manage';
  }

  return null;
}

function timingSafeCompareHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveConfiguredMetaVersion(envKey: string, recommendedVersion: string, supportedVersions: Set<string>) {
  const configuredVersion = normalizeOptionalString(process.env[envKey]) || recommendedVersion;

  if (supportedVersions.has(configuredVersion)) {
    return configuredVersion;
  }

  console.warn(`${envKey}=${configuredVersion} is not supported by Meta. Using ${recommendedVersion}.`);
  return recommendedVersion;
}

function getGraphPictureUrl(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const data = isRecord(value.data) ? (value.data as Record<string, unknown>) : null;
  return normalizeOptionalString(data?.url ?? value.url);
}

function isSupportedAppProfilePhotoMimeType(value: unknown) {
  return value === 'image/png' || value === 'image/jpeg';
}

function getAppProfilePhotoExtension(mimeType: string) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

function getStoragePublicUrl(bucket: string, objectPath: string) {
  const { data } = adminSupabase.storage.from(bucket).getPublicUrl(objectPath);
  return normalizeOptionalString(data.publicUrl);
}

function getAppProfilePhotoStoragePathFromUrl(value: unknown) {
  const publicUrl = normalizeOptionalString(value);

  if (!publicUrl || !supabaseUrl) {
    return null;
  }

  const normalizedSupabaseUrl = supabaseUrl.replace(/\/$/, '');
  const publicUrlPrefix = `${normalizedSupabaseUrl}/storage/v1/object/public/${APP_PROFILE_PICTURE_BUCKET}/`;

  if (!publicUrl.startsWith(publicUrlPrefix)) {
    return null;
  }

  return decodeURIComponent(publicUrl.slice(publicUrlPrefix.length));
}

async function deleteStoredAppProfilePhoto(value: unknown) {
  const objectPath = getAppProfilePhotoStoragePathFromUrl(value);

  if (!objectPath) {
    return;
  }

  const { error } = await adminSupabase.storage.from(APP_PROFILE_PICTURE_BUCKET).remove([objectPath]);

  if (error && !String(error.message || '').toLowerCase().includes('not found')) {
    throw error;
  }
}

async function uploadAppProfilePhoto(args: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
  purpose?: 'profile-picture' | 'company-logo';
}) {
  const objectPath = `${args.userId}/${args.purpose || 'profile-picture'}/${crypto.randomUUID()}.${getAppProfilePhotoExtension(args.mimeType)}`;
  const { error } = await adminSupabase.storage
    .from(APP_PROFILE_PICTURE_BUCKET)
    .upload(objectPath, args.buffer, {
      contentType: args.mimeType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const publicUrl = getStoragePublicUrl(APP_PROFILE_PICTURE_BUCKET, objectPath);

  if (!publicUrl) {
    throw new Error('Failed to resolve the uploaded profile picture URL.');
  }

  return publicUrl;
}

function getFirstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeWorkspaceUserRole(value: unknown): WorkspaceTeamMember['role'] {
  if (value === 'Owner' || value === 'Admin' || value === 'Manager') {
    return value;
  }

  return 'Agent';
}

function normalizeWorkspaceUserStatus(value: unknown): WorkspaceTeamMember['status'] {
  return value === 'active' ? 'active' : 'invited';
}

function normalizeNotificationType(value: unknown): NotificationType {
  switch (value) {
    case 'incoming_message':
    case 'incoming_email':
    case 'template_approved':
    case 'template_rejected':
    case 'missed_call':
    case 'lead_created':
    case 'campaign_sent':
    case 'email_campaign_sent':
    case 'display_name_approved':
    case 'team_member_joined':
      return value;
    default:
      return 'lead_created';
  }
}

function normalizeNotificationSoundPreset(
  value: unknown,
): NotificationPreferences['soundPreset'] {
  if (value === 'soft' || value === 'pulse') {
    return value;
  }

  return 'classic';
}

function normalizeBooleanPreference(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNotificationVolume(value: unknown, fallback = 0.8) {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Math.round(numericValue * 100) / 100));
}

function getDefaultNotificationPreferences(userId: string): NotificationPreferences {
  const now = new Date().toISOString();

  return {
    userId,
    enabled: true,
    soundEnabled: true,
    callSoundEnabled: true,
    soundPreset: 'classic',
    volume: 0.8,
    incomingMessageEnabled: true,
    incomingEmailEnabled: true,
    templateReviewEnabled: true,
    missedCallEnabled: true,
    leadEnabled: true,
    campaignSentEnabled: true,
    emailCampaignEnabled: true,
    displayNameApprovedEnabled: true,
    teamJoinedEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function notificationTypeToPreferenceKey(
  type: NotificationType,
):
  | 'incomingMessageEnabled'
  | 'incomingEmailEnabled'
  | 'templateReviewEnabled'
  | 'missedCallEnabled'
  | 'leadEnabled'
  | 'campaignSentEnabled'
  | 'emailCampaignEnabled'
  | 'displayNameApprovedEnabled'
  | 'teamJoinedEnabled'
  | null {
  switch (type) {
    case 'incoming_message':
      return 'incomingMessageEnabled';
    case 'incoming_email':
      return 'incomingEmailEnabled';
    case 'template_approved':
    case 'template_rejected':
      return 'templateReviewEnabled';
    case 'missed_call':
      return 'missedCallEnabled';
    case 'lead_created':
      return 'leadEnabled';
    case 'campaign_sent':
      return 'campaignSentEnabled';
    case 'email_campaign_sent':
      return 'emailCampaignEnabled';
    case 'display_name_approved':
      return 'displayNameApprovedEnabled';
    case 'team_member_joined':
      return 'teamJoinedEnabled';
    default:
      return null;
  }
}

function shouldCreateNotification(
  preferences: NotificationPreferences,
  type: NotificationType,
) {
  if (!preferences.enabled) {
    return false;
  }

  const preferenceKey = notificationTypeToPreferenceKey(type);

  if (!preferenceKey) {
    return true;
  }

  return preferences[preferenceKey];
}

function normalizeEmailAddress(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

async function verifyPasswordResetUserExists(email: string) {
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data.users || [];
    const userExists = users.some((user) => normalizeEmailAddress(user.email) === email);

    if (userExists) {
      return;
    }

    if (users.length < perPage) {
      break;
    }
  }

  throw new Error('No account exists with that email address.');
}

function sendPasswordResetEmailInBackground(args: {
  email: string;
  redirectTo: string;
  captchaToken?: string;
}) {
  setImmediate(() => {
    authSupabase.auth
      .resetPasswordForEmail(args.email, {
        redirectTo: args.redirectTo,
        captchaToken: args.captchaToken,
      })
      .then(({ error }) => {
        if (error) {
          console.error('Background password reset email failed:', error);
        }
      })
      .catch((error) => {
        console.error('Background password reset email failed:', error);
      });
  });
}

function normalizeEmailPort(value: unknown, label: string) {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 65535) {
    throw new Error(`${label} must be a valid port number.`);
  }

  return numeric;
}

function normalizeSmtpSecure(port: number, value: unknown) {
  if (port === 465) {
    return true;
  }

  if (port === 587 || port === 25) {
    return false;
  }

  return value !== false;
}

function normalizeImapSecure(port: number, value: unknown) {
  if (port === 993) {
    return true;
  }

  if (port === 143) {
    return false;
  }

  return value !== false;
}

function normalizeEmailConnectionInput(input: EmailConnectionUpsertInput) {
  const displayName = normalizeEditableString(input.displayName);
  const emailAddress = normalizeEmailAddress(input.emailAddress);
  const authUser = normalizeEditableString(input.authUser);
  const password = typeof input.password === 'string' ? input.password.trim() : '';
  const smtpHost = normalizeEditableString(input.smtpHost);
  const imapHost = normalizeEditableString(input.imapHost);

  if (!displayName) {
    throw new Error('Display name is required.');
  }

  if (!emailAddress) {
    throw new Error('A valid email address is required.');
  }

  if (!authUser) {
    throw new Error('A valid SMTP/IMAP username is required.');
  }

  if (!password) {
    throw new Error('Password is required.');
  }

  if (!smtpHost) {
    throw new Error('SMTP host is required.');
  }

  if (!imapHost) {
    throw new Error('IMAP host is required.');
  }

  const smtpPort = normalizeEmailPort(input.smtpPort, 'SMTP port');
  const imapPort = normalizeEmailPort(input.imapPort, 'IMAP port');

  return {
    displayName,
    emailAddress,
    authUser,
    password,
    smtpHost,
    smtpPort,
    smtpSecure: normalizeSmtpSecure(smtpPort, input.smtpSecure),
    imapHost,
    imapPort,
    imapSecure: normalizeImapSecure(imapPort, input.imapSecure),
  };
}

function normalizeEmailTemplateEditorMode(value: unknown): EmailTemplate['editorMode'] {
  return value === 'html' ? 'html' : 'rich';
}

function normalizeEmailTemplateInput(input: EmailTemplateSaveInput) {
  const name = normalizeEditableString(input.name);
  const subject = normalizeEditableString(input.subject);
  const htmlContent = typeof input.htmlContent === 'string' ? input.htmlContent.trim() : '';

  if (!name) {
    throw new Error('Template name is required.');
  }

  if (!subject) {
    throw new Error('Email subject is required.');
  }

  if (!htmlContent) {
    throw new Error('Email template content cannot be empty.');
  }

  return {
    name,
    subject,
    editorMode: normalizeEmailTemplateEditorMode(input.editorMode),
    htmlContent,
  };
}

function normalizeEmailRecipients(value: unknown): EmailRecipient[] {
  if (!Array.isArray(value)) {
    throw new Error('At least one email recipient is required.');
  }

  const deduped = new Map<string, EmailRecipient>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const email = normalizeEmailAddress((entry as { email?: unknown }).email);

    if (!email) {
      continue;
    }

    const name = normalizeEditableString((entry as { name?: unknown }).name) || null;
    deduped.set(email, { email, name });
  }

  const recipients = Array.from(deduped.values());

  if (recipients.length === 0) {
    throw new Error('At least one valid email recipient is required.');
  }

  return recipients;
}

function normalizeEmailCampaignInput(input: EmailCampaignSendInput) {
  const templateId = normalizeOptionalIdentifier(input.templateId);
  const campaignName = normalizeEditableString(input.campaignName);
  const audienceSource: EmailCampaign['audienceSource'] =
    input.audienceSource === 'custom' ? 'custom' : 'contacts';

  if (!templateId) {
    throw new Error('A saved email template is required.');
  }

  if (!campaignName) {
    throw new Error('Campaign name is required.');
  }

  return {
    templateId,
    campaignName,
    audienceSource,
    recipients: normalizeEmailRecipients(input.recipients),
  };
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInsightsChannel(value: unknown): InboxInsightsChannel {
  if (value === 'whatsapp' || value === 'instagram' || value === 'messenger') {
    return value;
  }

  return 'all';
}

function formatIsoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseInsightsDateInput(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveInsightsDateRange(startDate: unknown, endDate: unknown) {
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const parsedStart = parseInsightsDateInput(startDate) || todayUtc;
  const parsedEnd = parseInsightsDateInput(endDate) || parsedStart;

  const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
  const end = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return {
    startDate: formatIsoDateInput(start),
    endDate: formatIsoDateInput(end),
    startAtIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
}

function getMessagingLimitCapacity(tier: string | null) {
  if (!tier) {
    return null;
  }

  const normalized = tier.trim().toUpperCase();
  const exactMap: Record<string, number | null> = {
    TIER_250: 250,
    TIER_1K: 1000,
    TIER_2K: 2000,
    TIER_10K: 10000,
    TIER_100K: 100000,
    TIER_UNLIMITED: null,
    UNLIMITED: null,
  };

  if (normalized in exactMap) {
    return exactMap[normalized];
  }

  const shorthandMatch = normalized.match(/(\d+)(K|M)/);

  if (shorthandMatch) {
    const numeric = Number(shorthandMatch[1]);
    const multiplier = shorthandMatch[2] === 'M' ? 1_000_000 : 1_000;
    return numeric * multiplier;
  }

  const numericMatch = normalized.match(/(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : null;
}

function getNormalizedMessagingLimitTier(
  value:
    | {
        whatsapp_business_manager_messaging_limit?: unknown;
        messaging_limit_tier?: unknown;
      }
    | null
    | undefined,
) {
  return (
    normalizeOptionalString(value?.whatsapp_business_manager_messaging_limit) ||
    normalizeOptionalString(value?.messaging_limit_tier)
  );
}

type InsightsMessageRow = {
  thread_id: string | null;
  direction: string | null;
  status: string | null;
  recipient_wa_id: string | null;
  created_at: string | null;
};

function countRepliedOutboundMessages(rows: InsightsMessageRow[]) {
  const rowsByThread = new Map<string, InsightsMessageRow[]>();

  for (const row of rows) {
    const threadId = row.thread_id || '';

    if (!threadId) {
      continue;
    }

    const existing = rowsByThread.get(threadId);

    if (existing) {
      existing.push(row);
      continue;
    }

    rowsByThread.set(threadId, [row]);
  }

  let repliedCount = 0;

  for (const threadRows of rowsByThread.values()) {
    for (let index = 0; index < threadRows.length - 1; index += 1) {
      const current = threadRows[index];
      const next = threadRows[index + 1];

      if (current.direction === 'outbound' && next.direction === 'inbound') {
        repliedCount += 1;
      }
    }
  }

  return repliedCount;
}

function normalizeEditableString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim();
}

function normalizeWhatsAppBusinessVerticalToken(value: string | null | undefined) {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function normalizeWhatsAppBusinessVertical(value: unknown) {
  const normalizedValue = normalizeEditableString(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  if (!normalizedValue) {
    return '';
  }

  const normalizedToken = normalizeWhatsAppBusinessVerticalToken(normalizedValue);
  const aliases: Record<string, string> = {
    OTHER: 'OTHER',
    AUTO: 'AUTO',
    AUTOMOTIVE: 'AUTO',
    BEAUTY: 'BEAUTY',
    BEAUTYSPAANDSALON: 'BEAUTY',
    APPAREL: 'APPAREL',
    CLOTHING: 'APPAREL',
    EDU: 'EDU',
    EDUCATION: 'EDU',
    ENTERTAIN: 'ENTERTAIN',
    ENTERTAINMENT: 'ENTERTAIN',
    EVENTPLAN: 'EVENT_PLAN',
    EVENTPLANNINGANDSERVICE: 'EVENT_PLAN',
    FINANCE: 'FINANCE',
    FINANCEANDBANKING: 'FINANCE',
    GROCERY: 'GROCERY',
    FOODANDGROCERIES: 'GROCERY',
    GOVT: 'GOVT',
    GOVERNMENT: 'GOVT',
    PUBLICSERVICE: 'GOVT',
    HOTEL: 'HOTEL',
    HOTELANDLODGING: 'HOTEL',
    HEALTH: 'HEALTH',
    MEDICALANDHEALTH: 'HEALTH',
    NONPROFIT: 'NONPROFIT',
    CHARITY: 'NONPROFIT',
    PROFSERVICES: 'PROF_SERVICES',
    PROFESSIONALSERVICES: 'PROF_SERVICES',
    RETAIL: 'RETAIL',
    SHOPPINGANDRETAIL: 'RETAIL',
    TRAVEL: 'TRAVEL',
    TRAVELANDTRANSPORTATION: 'TRAVEL',
    RESTAURANT: 'RESTAURANT',
    ALCOHOL: 'ALCOHOL',
    ALCOHOLICDRINKS: 'ALCOHOL',
    ONLINEGAMBLING: 'ONLINE_GAMBLING',
    ONLINEGAMBLINGANDGAMING: 'ONLINE_GAMBLING',
    PHYSICALGAMBLING: 'PHYSICAL_GAMBLING',
    NONONLINEGAMBLINGANDGAMING: 'PHYSICAL_GAMBLING',
    OTCDRUGS: 'OTC_DRUGS',
    OVERTHECOUNTERMEDICINE: 'OTC_DRUGS',
    MATRIMONYSERVICE: 'MATRIMONY_SERVICE',
    MATRIMONIALSERVICE: 'MATRIMONY_SERVICE',
  };

  return aliases[normalizedToken] || normalizedValue.toUpperCase();
}

function normalizeStringArray(value: unknown, options?: { uppercase?: boolean }) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => (options?.uppercase ? entry.toUpperCase() : entry));

  return Array.from(new Set(normalized));
}

function normalizeConversationalAutomationPrompt(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeConversationalAutomationCommandName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/^\/+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();

  return normalized || null;
}

function normalizeConversationalAutomationCommandDescription(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeConversationalAutomationCommands(value: unknown): WhatsAppAutomationCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenNames = new Set<string>();
  const commands: WhatsAppAutomationCommand[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const commandName = normalizeConversationalAutomationCommandName(
      entry.commandName ?? entry.command_name,
    );
    const commandDescription = normalizeConversationalAutomationCommandDescription(
      entry.commandDescription ?? entry.command_description,
    );

    if (!commandName || !commandDescription) {
      throw new Error('Each bot command needs a command name and description.');
    }

    if (seenNames.has(commandName)) {
      throw new Error(`Bot command "/${commandName}" is duplicated. Use unique command names.`);
    }

    seenNames.add(commandName);
    commands.push({
      commandName,
      commandDescription,
    });
  }

  return commands;
}

function normalizeConversationalAutomationInput(
  input: WhatsAppConversationalAutomationUpdateInput | null | undefined,
): Required<WhatsAppConversationalAutomationUpdateInput> {
  const prompts = Array.isArray(input?.prompts)
    ? Array.from(
        new Set(
          input.prompts
            .map((prompt) => normalizeConversationalAutomationPrompt(prompt))
            .filter((prompt): prompt is string => Boolean(prompt)),
        ),
      )
    : [];

  return {
    enableWelcomeMessage: Boolean(input?.enableWelcomeMessage),
    prompts,
    commands: normalizeConversationalAutomationCommands(input?.commands),
  };
}

type NormalizedAutomationRuleInput = {
  id: string | null;
  name: string;
  isEnabled: boolean;
  triggerType: AutomationRule['triggerType'];
  keyword: string;
  keywordMatchMode: AutomationRule['keywordMatchMode'];
  filters: AutomationRuleFilterGroup;
  action: AutomationRuleAction;
};

function normalizeAutomationRuleName(value: unknown, keyword: string) {
  const trimmed = normalizeOptionalString(value);
  const fallback = keyword && keyword !== '*' ? `When "${keyword.slice(0, 48)}" is received` : 'New automation trigger';
  return (trimmed || fallback).slice(0, 90);
}

function normalizeAutomationRuleKeyword(value: unknown, matchMode: AutomationRule['keywordMatchMode']) {
  const keyword = normalizeOptionalString(value);

  if (matchMode === 'any') {
    return '*';
  }

  if (!keyword) {
    throw new Error('Each rule needs a filter value.');
  }

  if (keyword.length > 120) {
    throw new Error('Rule filter values must be 120 characters or less.');
  }

  return keyword;
}

function normalizeAutomationRuleMatchMode(value: unknown): AutomationRule['keywordMatchMode'] {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === 'any') {
    return 'any';
  }

  if (
    normalized === 'equals' ||
    normalized === 'starts_with' ||
    normalized === 'ends_with' ||
    normalized === 'fuzzy'
  ) {
    return normalized;
  }

  return 'contains';
}

function normalizeAutomationRuleTriggerType(value: unknown): AutomationRule['triggerType'] {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (!normalized || normalized === 'incoming_message_keyword') {
    return 'incoming_message_keyword';
  }

  if (
    normalized === 'whatsapp_message_received' ||
    normalized === 'instagram_message_received' ||
    normalized === 'contact_attribute_added' ||
    normalized === 'contact_attribute_changed' ||
    normalized === 'lead_created'
  ) {
    return normalized;
  }

  throw new Error(`Unsupported rule trigger: ${normalized}.`);
}

function normalizeAutomationRuleFilterCondition(value: unknown, index: number): AutomationRuleFilterCondition {
  if (!isRecord(value)) {
    throw new Error(`Filter ${index + 1} is not valid.`);
  }

  const type = normalizeOptionalString(value.type)?.toLowerCase();
  const operator = normalizeOptionalString(value.operator)?.toLowerCase();
  const values = Array.isArray(value.values)
    ? value.values.map((entry) => normalizeOptionalString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const normalized: AutomationRuleFilterCondition = {
    id: normalizeOptionalString(value.id) || undefined,
    type:
      type === 'contact_initiates_chat' ||
      type === 'timestamp' ||
      type === 'no_keyword_matches' ||
      type === 'contact_exists' ||
      type === 'contact_attribute'
        ? type
        : 'message_contains_keywords',
    operator:
      operator === 'equals' ||
      operator === 'contains' ||
      operator === 'starts_with' ||
      operator === 'ends_with' ||
      operator === 'fuzzy' ||
      operator === 'does_not_equal' ||
      operator === 'between' ||
      operator === 'outside' ||
      operator === 'is_true' ||
      operator === 'is_false'
        ? operator
        : 'contains_any',
    field: normalizeOptionalString(value.field) || undefined,
    value: normalizeOptionalString(value.value) || undefined,
    values,
    startTime: normalizeOptionalString(value.startTime ?? value.start_time) || undefined,
    endTime: normalizeOptionalString(value.endTime ?? value.end_time) || undefined,
  };

  if (normalized.type === 'message_contains_keywords' && normalized.values.length === 0) {
    throw new Error(`Add at least one keyword for filter ${index + 1}.`);
  }

  if (
    normalized.type === 'contact_attribute' &&
    (!normalized.field || !normalized.value)
  ) {
    throw new Error(`Add an attribute name and value for filter ${index + 1}.`);
  }

  if (normalized.type === 'timestamp' && (!normalized.startTime || !normalized.endTime)) {
    throw new Error(`Add start and end times for filter ${index + 1}.`);
  }

  return normalized;
}

function buildLegacyAutomationFilterGroup(
  keyword: string,
  matchMode: AutomationRule['keywordMatchMode'],
): AutomationRuleFilterGroup {
  if (matchMode === 'any') {
    return {
      operator: 'AND',
      conditions: [],
    };
  }

  return {
    operator: 'AND',
    conditions: [
      {
        type: 'message_contains_keywords',
        operator: matchMode === 'equals' ? 'equals' : 'contains_any',
        values: keyword ? [keyword] : [],
      },
    ],
  };
}

function normalizeAutomationRuleFilters(value: unknown): AutomationRuleFilterGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  const operator = normalizeOptionalString(value.operator)?.toUpperCase() === 'OR' ? 'OR' : 'AND';
  const rawConditions = Array.isArray(value.conditions) ? value.conditions : [];

  return {
    operator,
    conditions: rawConditions.map((condition, index) => normalizeAutomationRuleFilterCondition(condition, index)),
  };
}

function normalizeAutomationRuleAction(value: unknown): AutomationRuleAction {
  if (!isRecord(value)) {
    throw new Error('Each rule needs an action.');
  }

  const actionType = normalizeOptionalString(value.type)?.toLowerCase();

  if (actionType === 'send_flow') {
    const flowId = normalizeOptionalIdentifier(value.flowId ?? value.flow_id);
    const flowCta = normalizeOptionalString(value.flowCta ?? value.flow_cta) || 'Open Flow';
    const flowBody = normalizeOptionalString(value.flowBody ?? value.flow_body);
    const flowHeader = normalizeOptionalString(value.flowHeader ?? value.flow_header);
    const flowFooter = normalizeOptionalString(value.flowFooter ?? value.flow_footer);
    const flowModeValue = normalizeOptionalString(value.flowMode ?? value.flow_mode)?.toLowerCase();
    const flowActionValue = normalizeOptionalString(value.flowAction ?? value.flow_action)?.toLowerCase();
    const flowToken = normalizeOptionalString(value.flowToken ?? value.flow_token);
    const flowScreen = normalizeOptionalString(value.flowScreen ?? value.flow_screen);
    const flowActionData = isRecord(value.flowActionData)
      ? (value.flowActionData as Record<string, unknown>)
      : isRecord(value.flow_action_data)
        ? (value.flow_action_data as Record<string, unknown>)
        : null;
    const filters = normalizeAutomationRuleFilters(value.filters);

    if (!flowId) {
      throw new Error('Flow rules need a Flow.');
    }

    if (!flowBody) {
      throw new Error('Flow rules need a message body.');
    }

    if (flowCta.length > 30) {
      throw new Error('Flow CTA text must be 30 characters or less.');
    }

    return {
      type: 'send_flow',
      flowId,
      flowCta,
      flowBody,
      ...(flowHeader ? { flowHeader } : {}),
      ...(flowFooter ? { flowFooter } : {}),
      flowMode: flowModeValue === 'draft' ? 'draft' : 'published',
      ...(flowToken ? { flowToken } : {}),
      flowAction: flowActionValue === 'data_exchange' ? 'data_exchange' : 'navigate',
      ...(flowScreen ? { flowScreen } : {}),
      ...(flowActionData && Object.keys(flowActionData).length > 0 ? { flowActionData } : {}),
      ...(filters ? { filters } : {}),
    };
  }

  if (actionType === 'send_template') {
    const templateName = normalizeOptionalString(value.templateName ?? value.template_name);
    const templateLanguage = normalizeOptionalString(value.templateLanguage ?? value.template_language);
    const filters = normalizeAutomationRuleFilters(value.filters);

    if (!templateName || !templateLanguage) {
      throw new Error('Template rules need a template name and language.');
    }

    return {
      type: 'send_template',
      templateName,
      templateLanguage,
      ...(filters ? { filters } : {}),
    };
  }

  if (actionType === 'opt_out_marketing') {
    const filters = normalizeAutomationRuleFilters(value.filters);

    return {
      type: 'opt_out_marketing',
      ...(filters ? { filters } : {}),
    };
  }

  if (!actionType || actionType === 'send_text') {
    const messageBody = normalizeOptionalString(value.messageBody ?? value.message_body);
    const filters = normalizeAutomationRuleFilters(value.filters);

    if (!messageBody) {
      throw new Error('Message rules need a response message.');
    }

    if (messageBody.length > 4096) {
      throw new Error('Rule response messages must be 4,096 characters or less.');
    }

    return {
      type: 'send_text',
      messageBody,
      ...(filters ? { filters } : {}),
    };
  }

  throw new Error(`Unsupported rule action: ${actionType}.`);
}

function normalizeAutomationRuleInput(input: AutomationRuleInput, index: number): NormalizedAutomationRuleInput {
  if (!isRecord(input)) {
    throw new Error(`Rule ${index + 1} is not valid.`);
  }

  const keywordMatchMode = normalizeAutomationRuleMatchMode(input.keywordMatchMode);
  const keyword = normalizeAutomationRuleKeyword(input.keyword, keywordMatchMode);
  const inputAction = input.action as AutomationRuleAction | undefined;
  const filters =
    normalizeAutomationRuleFilters(input.filters) ||
    normalizeAutomationRuleFilters(inputAction?.filters) ||
    buildLegacyAutomationFilterGroup(keyword, keywordMatchMode);
  const action = normalizeAutomationRuleAction(inputAction);

  return {
    id: normalizeOptionalIdentifier(input.id),
    name: normalizeAutomationRuleName(input.name, keyword),
    isEnabled: Boolean(input.isEnabled),
    triggerType: normalizeAutomationRuleTriggerType(input.triggerType),
    keyword,
    keywordMatchMode,
    filters,
    action: {
      ...action,
      filters,
    },
  };
}

function normalizeAutomationRulesInput(value: unknown): NormalizedAutomationRuleInput[] {
  if (!Array.isArray(value)) {
    throw new Error('Rules must be an array.');
  }

  if (value.length > 25) {
    throw new Error('You can save up to 25 automation rules.');
  }

  return value.map((entry, index) => {
    return normalizeAutomationRuleInput(entry as AutomationRuleInput, index);
  });
}

function generateVerifyToken() {
  return crypto.randomBytes(18).toString('hex');
}

function getRequestOrigin(req: Request) {
  const forwardedProto = normalizeOptionalString(req.headers['x-forwarded-proto']);
  const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
  const host = normalizeOptionalString(req.get('host'));
  return host ? `${protocol}://${host}` : frontendOrigin;
}

function requireMetaWebhookVerifyToken() {
  if (!metaWebhookVerifyToken) {
    throw new Error(
      'META_WEBHOOK_VERIFY_TOKEN must be configured on the API server before inbound WhatsApp webhooks can be activated.',
    );
  }
}

function getMetaWebhookCallbackUrl(req: Request) {
  return new URL('/api/meta/webhook', getRequestOrigin(req)).toString();
}

function getMetaLeadCaptureCallbackUrl(req: Request) {
  return new URL('/api/meta/lead-capture/webhook', getRequestOrigin(req)).toString();
}

function getMetaCatalogWebhookCallbackUrl(req: Request) {
  return new URL('/api/meta/catalog/webhook', getRequestOrigin(req)).toString();
}

function getMessengerWebhookCallbackUrl() {
  return new URL('/api/messenger/webhook', frontendOrigin).toString();
}

function getWooCommerceCallbackUrl(req: Request, userId: string) {
  return new URL(`/api/integrations/woocommerce/webhook/${encodeURIComponent(userId)}`, getRequestOrigin(req)).toString();
}

function normalizePhoneLike(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) {
    return null;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly || null;
}

function normalizeContactIdentity(value: unknown) {
  return normalizePhoneLike(value) || normalizeOptionalString(value);
}

function formatContactIdentity(value: unknown) {
  const normalizedPhone = normalizePhoneLike(value);

  if (normalizedPhone) {
    return `+${normalizedPhone}`;
  }

  return normalizeOptionalString(value);
}

function buildContactIdentityVariants(value: unknown) {
  const normalizedPhone = normalizePhoneLike(value);

  if (normalizedPhone) {
    return Array.from(new Set([normalizedPhone, `+${normalizedPhone}`]));
  }

  const normalizedIdentity = normalizeOptionalString(value);
  return normalizedIdentity ? [normalizedIdentity] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCallDirection(value: unknown): WhatsAppCallDirection {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (
      normalized === 'incoming' ||
      normalized === 'user_initiated' ||
      normalized === 'user-initiated' ||
      normalized === 'user initiated'
    ) {
      return 'incoming';
    }
  }

  return 'outgoing';
}

function normalizeCallState(
  value: unknown,
  fallback: WhatsAppCallState | '' = 'dialing',
): WhatsAppCallState | '' {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'incoming':
      return 'incoming';
    case 'dialing':
    case 'calling':
      return 'dialing';
    case 'ringing':
    case 'pre_accept':
    case 'pre-accept':
      return 'ringing';
    case 'connecting':
    case 'connect':
      return 'connecting';
    case 'accepted':
    case 'accept':
    case 'connected':
    case 'ongoing':
    case 'active':
    case 'in_progress':
    case 'in-progress':
      return 'ongoing';
    case 'ending':
      return 'ending';
    case 'ended':
    case 'terminate':
    case 'terminated':
    case 'complete':
    case 'completed':
      return 'ended';
    case 'rejected':
    case 'reject':
    case 'denied':
    case 'declined':
      return 'rejected';
    case 'missed':
      return 'missed';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return fallback;
  }
}

function isTerminalCallState(state: WhatsAppCallState) {
  return state === 'ended' || state === 'rejected' || state === 'missed' || state === 'failed';
}

function extractPhoneLike(value: unknown): string | null {
  const normalizedDirect = normalizePhoneLike(value);

  if (normalizedDirect) {
    return normalizedDirect;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalizedEntry = extractPhoneLike(entry);

      if (normalizedEntry) {
        return normalizedEntry;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  return (
    normalizePhoneLike(value.wa_id) ||
    normalizePhoneLike(value.user_wa_id) ||
    normalizePhoneLike(value.phone) ||
    normalizePhoneLike(value.phone_number) ||
    normalizePhoneLike(value.id) ||
    null
  );
}

function inferCallStateFromWebhook(args: {
  eventName?: string | null;
  statusName?: string | null;
  direction: WhatsAppCallDirection;
  hasOffer: boolean;
  hasAnswer: boolean;
}) {
  const explicitState = normalizeCallState(args.statusName || args.eventName, '');

  if (explicitState) {
    if (explicitState === 'connecting' && args.direction === 'incoming' && args.hasOffer) {
      return 'incoming';
    }

    return explicitState;
  }

  if (args.hasAnswer) {
    return 'connecting';
  }

  if (args.direction === 'incoming' && args.hasOffer) {
    return 'incoming';
  }

  return args.direction === 'incoming' ? 'incoming' : 'dialing';
}

function getCallLogTypeFromSession(session: Pick<WhatsAppCallSessionRecord, 'direction' | 'state'>): CallLog['type'] {
  if (session.direction === 'incoming') {
    return session.state === 'missed' || session.state === 'rejected' ? 'missed' : 'incoming';
  }

  return 'outgoing';
}

function formatCallStateLabel(state: WhatsAppCallState) {
  switch (state) {
    case 'incoming':
      return 'Incoming';
    case 'dialing':
      return 'Dialing';
    case 'ringing':
      return 'Ringing';
    case 'connecting':
      return 'Connecting';
    case 'ongoing':
      return 'Ongoing';
    case 'ending':
      return 'Ending';
    case 'ended':
      return 'Ended';
    case 'rejected':
      return 'Rejected';
    case 'missed':
      return 'Missed';
    case 'failed':
      return 'Failed';
    default:
      return state;
  }
}

function normalizeLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(labels)).slice(0, 12);
}

function normalizeWebsites(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const websites = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  return Array.from(new Set(websites)).slice(0, 2);
}

function extractTemplateVariables(value: string) {
  const matches = value.match(/\{\{\d+\}\}/g) || [];
  return Array.from(new Set(matches));
}

function buildTemplateExamples(value: string) {
  const variables = extractTemplateVariables(value);

  if (variables.length === 0) {
    return undefined;
  }

  return variables.map((_variable, index) => `Sample ${index + 1}`);
}

function guessMediaTypeFromMime(mimeType: string | null | undefined): SendMediaMessageInput['mediaType'] {
  if (!mimeType) {
    return 'document';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
}

function getMessageText(message: Record<string, unknown>) {
  const type = typeof message.type === 'string' ? message.type : 'text';

  switch (type) {
    case 'text':
      return ((message.text as { body?: string } | undefined)?.body || null) as string | null;
    case 'image':
      return ((message.image as { caption?: string } | undefined)?.caption || 'Image attachment') as string;
    case 'video':
      return ((message.video as { caption?: string } | undefined)?.caption || 'Video attachment') as string;
    case 'document':
      return (
        (message.document as { caption?: string; filename?: string } | undefined)?.caption ||
        (message.document as { filename?: string } | undefined)?.filename ||
        'Document attachment'
      ) as string;
    case 'audio':
      return 'Audio attachment';
    case 'sticker':
      return 'Sticker';
    case 'location': {
      const location = message.location as { latitude?: number; longitude?: number; name?: string } | undefined;
      return location?.name || (location?.latitude && location?.longitude ? `Location: ${location.latitude}, ${location.longitude}` : 'Location');
    }
    case 'contacts':
      return 'Contact card';
    case 'button':
      return ((message.button as { text?: string } | undefined)?.text || 'Button reply') as string;
    case 'interactive': {
      const interactive = isRecord(message.interactive) ? message.interactive : null;
      const body = isRecord(interactive?.body) ? interactive.body : null;
      const header = isRecord(interactive?.header) ? interactive.header : null;
      const footer = isRecord(interactive?.footer) ? interactive.footer : null;
      const buttonReply = isRecord(interactive?.button_reply) ? interactive.button_reply : null;
      const listReply = isRecord(interactive?.list_reply) ? interactive.list_reply : null;
      const nfmReply = isRecord(interactive?.nfm_reply) ? interactive.nfm_reply : null;
      const action = isRecord(interactive?.action) ? interactive.action : null;
      const parameters = isRecord(action?.parameters) ? action.parameters : null;

      return (
        normalizeOptionalString(body?.text) ||
        normalizeOptionalString(header?.text) ||
        normalizeOptionalString(footer?.text) ||
        normalizeOptionalString(nfmReply?.body) ||
        normalizeOptionalString(buttonReply?.title) ||
        normalizeOptionalString(listReply?.title) ||
        normalizeOptionalString(listReply?.description) ||
        normalizeOptionalString(parameters?.display_text) ||
        normalizeOptionalString(parameters?.text) ||
        normalizeOptionalString(parameters?.body) ||
        normalizeOptionalString(parameters?.title) ||
        null
      );
    }
    case 'system': {
      const system = isRecord(message.system) ? message.system : null;
      const body = normalizeOptionalString(system?.body);

      if (body) {
        return body;
      }

      const identity = normalizeOptionalString(system?.identity);
      const oldWaId = normalizeOptionalString(system?.wa_id);
      const newWaId = normalizeOptionalString(system?.new_wa_id);

      if (oldWaId && newWaId) {
        return `WhatsApp system notice: ${oldWaId} changed to ${newWaId}`;
      }

      if (identity) {
        return `WhatsApp system notice for ${identity}`;
      }

      return 'WhatsApp system message';
    }
    case 'unsupported': {
      const errors = Array.isArray(message.errors) ? message.errors.filter(isRecord) : [];
      const firstError = errors[0] || null;
      const errorData = firstError && isRecord(firstError.error_data) ? firstError.error_data : null;
      const details =
        normalizeOptionalString(errorData?.details) ||
        normalizeOptionalString(firstError?.message) ||
        normalizeOptionalString(firstError?.title);

      return details || 'This incoming WhatsApp message type is not supported by the API.';
    }
    default:
      return `${type} message`;
  }
}

function getMessengerThreadIdentity(senderId: string) {
  return `messenger:${senderId}`;
}

function getInstagramThreadIdentity(senderId: string) {
  return `instagram:${senderId}`;
}

function getMessengerAttachmentPreviewLabel(type: string | null, count: number) {
  if (count > 1) {
    return `${count} attachments`;
  }

  switch (type) {
    case 'image':
      return 'Image attachment';
    case 'video':
      return 'Video attachment';
    case 'audio':
      return 'Audio attachment';
    case 'file':
      return 'File attachment';
    case 'fallback':
      return 'Unsupported attachment';
    default:
      return 'Attachment';
  }
}

function parseMessengerInboundEvent(event: Record<string, unknown>) {
  const sender = isRecord(event.sender) ? event.sender : null;
  const recipient = isRecord(event.recipient) ? event.recipient : null;
  const senderId = normalizeOptionalIdentifier(sender?.id);
  const recipientId = normalizeOptionalIdentifier(recipient?.id);

  if (!senderId || !recipientId || senderId === recipientId) {
    return null;
  }

  const createdAt =
    toIsoTimestamp(
      typeof event.timestamp === 'string' || typeof event.timestamp === 'number'
        ? event.timestamp
        : null,
    ) || new Date().toISOString();
  const message = isRecord(event.message) ? event.message : null;
  const postback = isRecord(event.postback) ? event.postback : null;

  if (message) {
    if (message.is_echo === true) {
      return null;
    }

    const text = normalizeOptionalString(message.text);
    const quickReply = isRecord(message.quick_reply) ? message.quick_reply : null;
    const quickReplyPayload = normalizeOptionalString(quickReply?.payload);
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];
    const primaryAttachmentType =
      attachments.length > 0 ? normalizeOptionalString(attachments[0].type) : null;
    const messageId =
      normalizeOptionalString(message.mid) || `messenger:${senderId}:${String(event.timestamp || Date.now())}`;

    if (!text && attachments.length === 0 && !quickReplyPayload) {
      return null;
    }

    return {
      senderId,
      recipientId,
      messageId,
      createdAt,
      messageType:
        quickReplyPayload && !text
          ? 'quick_reply'
          : primaryAttachmentType === 'image' ||
              primaryAttachmentType === 'video' ||
              primaryAttachmentType === 'audio'
            ? primaryAttachmentType
            : primaryAttachmentType === 'file'
              ? 'document'
              : text
                ? 'text'
                : 'attachment',
      body:
        text ||
        quickReplyPayload ||
        getMessengerAttachmentPreviewLabel(primaryAttachmentType, attachments.length),
      raw: {
        source: 'messenger',
        event_type: 'message',
        ...event,
      },
    };
  }

  if (postback) {
    const title = normalizeOptionalString(postback.title);
    const payloadValue = normalizeOptionalString(postback.payload);

    return {
      senderId,
      recipientId,
      messageId: `messenger:postback:${senderId}:${String(event.timestamp || Date.now())}`,
      createdAt,
      messageType: 'postback',
      body: title || payloadValue || 'Postback reply',
      raw: {
        source: 'messenger',
        event_type: 'postback',
        ...event,
      },
    };
  }

  return null;
}

function isMessengerPageMessagingEvent(event: Record<string, unknown>, pageId: string) {
  const recipient = isRecord(event.recipient) ? event.recipient : null;
  const recipientId = normalizeOptionalIdentifier(recipient?.id);

  return Boolean(recipientId && recipientId === pageId);
}

function parseInstagramInboundEvent(event: Record<string, unknown>, instagramAccountId?: string | null) {
  const sender = isRecord(event.sender) ? event.sender : null;
  const recipient = isRecord(event.recipient) ? event.recipient : null;
  const senderId = normalizeOptionalIdentifier(sender?.id);
  const recipientId = normalizeOptionalIdentifier(recipient?.id);
  const businessAccountId = normalizeOptionalIdentifier(instagramAccountId);

  if (!senderId || !recipientId || senderId === recipientId || (businessAccountId && senderId === businessAccountId)) {
    return null;
  }

  const createdAt =
    toIsoTimestamp(
      typeof event.timestamp === 'string' || typeof event.timestamp === 'number'
        ? event.timestamp
        : null,
    ) || new Date().toISOString();
  const message = isRecord(event.message) ? event.message : null;
  const postback = isRecord(event.postback) ? event.postback : null;

  if (message) {
    if (message.is_echo === true) {
      return null;
    }

    const text = normalizeOptionalString(message.text);
    const quickReply = isRecord(message.quick_reply) ? message.quick_reply : null;
    const quickReplyPayload = normalizeOptionalString(quickReply?.payload);
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];
    const primaryAttachmentType =
      attachments.length > 0 ? normalizeOptionalString(attachments[0].type) : null;
    const messageId =
      normalizeOptionalString(message.mid) || `instagram:${senderId}:${String(event.timestamp || Date.now())}`;

    if (!text && attachments.length === 0 && !quickReplyPayload) {
      return null;
    }

    return {
      senderId,
      recipientId,
      messageId,
      createdAt,
      messageType:
        quickReplyPayload && !text
          ? 'quick_reply'
          : primaryAttachmentType === 'image' ||
              primaryAttachmentType === 'video' ||
              primaryAttachmentType === 'audio'
            ? primaryAttachmentType
            : primaryAttachmentType === 'file'
              ? 'document'
              : text
                ? 'text'
                : 'attachment',
      body:
        text ||
        quickReplyPayload ||
        getMessengerAttachmentPreviewLabel(primaryAttachmentType, attachments.length),
      raw: {
        source: 'instagram',
        event_type: 'message',
        ...event,
      },
    };
  }

  if (postback) {
    const title = normalizeOptionalString(postback.title);
    const payloadValue = normalizeOptionalString(postback.payload);

    return {
      senderId,
      recipientId,
      messageId: `instagram:postback:${senderId}:${String(event.timestamp || Date.now())}`,
      createdAt,
      messageType: 'postback',
      body: title || payloadValue || 'Postback reply',
      raw: {
        source: 'instagram',
        event_type: 'postback',
        ...event,
      },
    };
  }

  return null;
}

async function metaRequest<T>({
  accessToken,
  path: graphPath,
  method = 'GET',
  query,
  body,
  version = graphVersion,
  graphHost = 'graph.facebook.com',
}: {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  version?: string;
  graphHost?: 'graph.facebook.com' | 'graph.instagram.com';
}) {
  const url = new URL(`https://${graphHost}/${version}/${graphPath.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as T;
}

function buildMetaApiError(
  response: globalThis.Response,
  payload: {
    error?: {
      message?: string;
      error_user_msg?: string;
      error_data?: {
        details?: string;
      };
      code?: number;
    };
  } | null,
) {
  const code = payload?.error?.code;
  let message =
    payload?.error?.error_data?.details ||
    payload?.error?.error_user_msg ||
    payload?.error?.message ||
    `Meta API request failed with status ${response.status}`;

  if (code === 138006) {
    message = 'Call permission has not been granted by this WhatsApp user yet.';
  }

  if (code === 133010) {
    message =
      'This WhatsApp phone number is connected to the WABA but is not registered as a Cloud API sender yet. Open Meta Channels and complete sender registration with a 6-digit PIN.';
  }

  if (
    code === 200 &&
    message.toLowerCase().includes('necessary permission') &&
    message.toLowerCase().includes('whatsapp business account')
  ) {
    message =
      'The connected Meta token does not have permission to act on this WhatsApp Business Account. Reconnect WhatsApp with a Meta user/system token that has whatsapp_business_messaging and whatsapp_business_management permissions, and confirm the app or system user has access to this WABA and phone number in Meta Business Manager.';
  }

  if (code) {
    message = `${message} (code ${code})`;
  }

  const error = new Error(message) as Error & {
    metaCode?: number;
    metaStatus?: number;
  };
  error.metaCode = code;
  error.metaStatus = response.status;

  return error;
}

async function metaRequestDetailed<T>({
  accessToken,
  path: graphPath,
  method = 'GET',
  query,
  body,
  version = graphVersion,
  graphHost = 'graph.facebook.com',
}: {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  version?: string;
  graphHost?: 'graph.facebook.com' | 'graph.instagram.com';
}) {
  const url = new URL(`https://${graphHost}/${version}/${graphPath.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as T;
}

function normalizeMetaRedirectUriCandidate(value: string | undefined | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }

  return trimmed;
}

function expandMetaRedirectUriCandidates(value: string | undefined | null) {
  const normalized = normalizeMetaRedirectUriCandidate(value);
  if (!normalized) {
    return [];
  }

  const candidates: string[] = [normalized];

  try {
    const parsed = new URL(normalized);
    const origin = parsed.origin;
    const pathname = parsed.pathname || '/';
    const search = parsed.search || '';
    const pathnameWithoutTrailingSlash =
      pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const pathnameWithTrailingSlash =
      pathnameWithoutTrailingSlash === '/' ? '/' : `${pathnameWithoutTrailingSlash}/`;

    const addCandidate = (candidate: string) => {
      if (!candidate || candidates.includes(candidate)) {
        return;
      }

      candidates.push(candidate);
    };

    addCandidate(`${origin}${pathname}${search}`);
    if (search) {
      addCandidate(`${origin}${pathname}`);
      addCandidate(`${origin}${pathnameWithoutTrailingSlash}`);
      addCandidate(`${origin}${pathnameWithTrailingSlash}`);
    } else {
      addCandidate(`${origin}${pathnameWithoutTrailingSlash}`);
      addCandidate(`${origin}${pathnameWithTrailingSlash}`);
    }
    addCandidate(origin);
    addCandidate(`${origin}/`);
  } catch {
    return candidates;
  }

  return candidates;
}

function buildEmbeddedSignupRedirectUriCandidates(args: {
  redirectUri?: string;
  requestReferer?: string;
  requestOrigin?: string;
}) {
  const candidates: string[] = [];

  const addCandidate = (value: string | undefined | null) => {
    for (const candidate of expandMetaRedirectUriCandidates(value)) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  };

  addCandidate(args.redirectUri);
  addCandidate(args.requestReferer);
  addCandidate(metaRedirectUri);
  addCandidate(args.requestOrigin);

  return candidates;
}

async function exchangeEmbeddedSignupCode(
  code: string,
  options: {
    redirectUri?: string;
    requestReferer?: string;
    requestOrigin?: string;
  },
) {
  requireMetaAppCredentials();

  const redirectUriCandidates = buildEmbeddedSignupRedirectUriCandidates(options);
  const attempts = [null, ...redirectUriCandidates];
  let lastError: Error | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const redirectUri = attempts[index];
    const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    url.searchParams.set('client_id', metaAppId);
    url.searchParams.set('client_secret', metaAppSecret);
    url.searchParams.set('code', code);

    if (redirectUri) {
      url.searchParams.set('redirect_uri', redirectUri);
    }

    const response = await fetch(url);

    if (response.ok) {
      const payload = (await response.json()) as {
        access_token: string;
      };

      return payload.access_token;
    }

    let message = `Failed to exchange Meta authorization code (${response.status}).`;

    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
        };
      };
      message = payload.error?.message || message;
      const isRedirectUriMismatch =
        payload.error?.code === 100 &&
        payload.error?.error_subcode === 36008;

      lastError = new Error(message);
      const canRetry = isRedirectUriMismatch && index < attempts.length - 1;

      if (canRetry) {
        console.warn(
          `Meta embedded signup code exchange failed for redirect URI candidate ${redirectUri || '<omitted>'}. Retrying with the next candidate.`,
        );
        continue;
      }
    } catch {
      lastError = new Error(message);
      break;
    }

    break;
  }

  throw lastError || new Error('Failed to exchange Meta authorization code.');
}

async function exchangeInstagramLongLivedAccessToken(accessToken: string) {
  if (!instagramAppId || !instagramAppSecret) {
    throw new Error(
      'Instagram Business Login did not return a long-lived token, and INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are not configured for token exchange.',
    );
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', instagramAppId);
  url.searchParams.set('client_secret', instagramAppSecret);
  url.searchParams.set('fb_exchange_token', accessToken);

  const response = await fetch(url);

  if (!response.ok) {
    let message = `Failed to exchange the Instagram long-lived access token (${response.status}).`;

    try {
      const payload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };
      message = payload.error?.message || message;
    } catch {
      throw new Error(message);
    }

    throw new Error(message);
  }

  const payload = (await response.json()) as {
    access_token: string;
  };

  return payload.access_token;
}

type WhatsAppPhoneNumberSnapshot = {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  whatsapp_business_manager_messaging_limit?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  is_pin_enabled?: boolean;
};

const WHATSAPP_PHONE_NUMBER_BASE_FIELDS =
  'display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit,name_status';
const WHATSAPP_PHONE_NUMBER_LIVE_STATUS_FIELDS =
  `${WHATSAPP_PHONE_NUMBER_BASE_FIELDS},code_verification_status,is_pin_enabled`;

async function fetchPhoneNumber(accessToken: string, phoneNumberId: string) {
  try {
    return await metaRequest<WhatsAppPhoneNumberSnapshot>({
      accessToken,
      path: phoneNumberId,
      query: {
        fields: WHATSAPP_PHONE_NUMBER_LIVE_STATUS_FIELDS,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();

    if (!message.includes('code_verification_status') && !message.includes('is_pin_enabled')) {
      throw error;
    }

    return metaRequest<WhatsAppPhoneNumberSnapshot>({
      accessToken,
      path: phoneNumberId,
      query: {
        fields: WHATSAPP_PHONE_NUMBER_BASE_FIELDS,
      },
    });
  }
}

async function submitWhatsAppDisplayNameUpdate(
  accessToken: string,
  phoneNumberId: string,
  displayName: string,
) {
  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: phoneNumberId,
    method: 'POST',
    body: {
      new_display_name: displayName,
    },
  });
}

function normalizeMetaRegistrationPin(value: unknown) {
  const trimmed = typeof value === 'number' ? String(value) : normalizeOptionalString(value);

  if (!trimmed || !/^\d{6}$/.test(trimmed)) {
    throw new Error('Registration PIN must be exactly 6 digits.');
  }

  return trimmed;
}

function generateMetaRegistrationPin() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function normalizeMetaVerificationCodeMethod(value: unknown): 'SMS' | 'VOICE' {
  if (value === 'SMS' || value === 'VOICE') {
    return value;
  }

  throw new Error('Verification code method must be SMS or VOICE.');
}

function normalizeMetaVerificationCodeLanguage(value: unknown) {
  const language = normalizeOptionalString(value);

  if (!language) {
    throw new Error('Verification code language is required.');
  }

  if (language.length > 32) {
    throw new Error('Verification code language must be 32 characters or fewer.');
  }

  return language;
}

function normalizeMetaVerificationCode(value: unknown) {
  const code = normalizeOptionalString(value);

  if (!code || !/^\d{4,10}$/.test(code)) {
    throw new Error('Verification code must be a numeric code between 4 and 10 digits.');
  }

  return code;
}

function normalizeWhatsAppDisplayName(value: unknown) {
  const displayName = normalizeEditableString(value);

  if (!displayName || displayName.length < 3) {
    throw new Error('Display name must be at least 3 characters.');
  }

  if (displayName.length > 100) {
    throw new Error('Display name must be 100 characters or fewer.');
  }

  return displayName;
}

function getMetaChannelMetadataRecord(row: Record<string, unknown>) {
  return isRecord(row.metadata) ? (row.metadata as Record<string, unknown>) : {};
}

function getTwoStepVerificationEnabledFromPhoneSnapshot(phone: WhatsAppPhoneNumberSnapshot) {
  if (typeof phone.is_pin_enabled === 'boolean') {
    return phone.is_pin_enabled;
  }

  const normalizedStatus = normalizeOptionalString(phone.code_verification_status)?.toUpperCase();

  if (!normalizedStatus) {
    return null;
  }

  if (normalizedStatus === 'VERIFIED') {
    return true;
  }

  if (
    normalizedStatus === 'UNVERIFIED' ||
    normalizedStatus === 'NOT_VERIFIED' ||
    normalizedStatus === 'EXPIRED' ||
    normalizedStatus === 'PENDING'
  ) {
    return false;
  }

  return null;
}

function mergeLiveTwoStepVerificationMetadata(
  metadata: Record<string, unknown>,
  phone: WhatsAppPhoneNumberSnapshot,
  checkedAt: string,
) {
  const currentTwoStepVerification = isRecord(metadata.twoStepVerification)
    ? (metadata.twoStepVerification as Record<string, unknown>)
    : {};
  const isEnabled = getTwoStepVerificationEnabledFromPhoneSnapshot(phone);

  if (isEnabled === null) {
    return {
      ...metadata,
      twoStepVerification: {
        ...currentTwoStepVerification,
        codeVerificationStatus: normalizeOptionalString(phone.code_verification_status),
        isPinEnabled:
          typeof phone.is_pin_enabled === 'boolean'
            ? phone.is_pin_enabled
            : currentTwoStepVerification.isPinEnabled ?? null,
        liveStatusCheckedAt: checkedAt,
      },
    };
  }

  return {
    ...metadata,
    twoStepVerification: {
      ...currentTwoStepVerification,
      codeVerificationStatus: normalizeOptionalString(phone.code_verification_status),
      isPinEnabled: isEnabled,
      liveStatusCheckedAt: checkedAt,
      enabledAt: isEnabled
        ? normalizeOptionalString(currentTwoStepVerification.enabledAt) || checkedAt
        : normalizeOptionalString(currentTwoStepVerification.enabledAt),
      disabledAt: isEnabled ? null : checkedAt,
    },
  };
}

function mapStoredTwoStepVerificationStatus(metadata: unknown): WhatsAppBusinessProfile['twoStepVerification'] {
  if (!isRecord(metadata) || !isRecord(metadata.twoStepVerification)) {
    return null;
  }

  const twoStepVerification = metadata.twoStepVerification as Record<string, unknown>;
  const isPinEnabled =
    typeof twoStepVerification.isPinEnabled === 'boolean'
      ? twoStepVerification.isPinEnabled
      : null;

  return {
    codeVerificationStatus: normalizeOptionalString(twoStepVerification.codeVerificationStatus),
    isPinEnabled,
    liveStatusCheckedAt: normalizeOptionalString(twoStepVerification.liveStatusCheckedAt),
    enabledAt: normalizeOptionalString(twoStepVerification.enabledAt),
    disabledAt: normalizeOptionalString(twoStepVerification.disabledAt),
    lastPinUpdatedAt: normalizeOptionalString(twoStepVerification.lastPinUpdatedAt),
  };
}

function getStoredWhatsAppRegistrationPin(metadata: Record<string, unknown>) {
  const twoStepVerification = isRecord(metadata.twoStepVerification)
    ? (metadata.twoStepVerification as Record<string, unknown>)
    : {};
  const pinCiphertext = normalizeOptionalString(twoStepVerification.pinCiphertext);

  if (!pinCiphertext) {
    return null;
  }

  try {
    const pin = decryptSecretValue(pinCiphertext);
    return /^\d{6}$/.test(pin) ? pin : null;
  } catch (error) {
    console.error('Failed to decrypt stored WhatsApp registration PIN:', error);
    return null;
  }
}

function resolveWhatsAppRegistrationPin(
  metadata: Record<string, unknown>,
  rawPin?: unknown,
) {
  const hasProvidedPin =
    rawPin !== undefined && rawPin !== null && !(typeof rawPin === 'string' && !rawPin.trim());

  if (hasProvidedPin) {
    return {
      pin: normalizeMetaRegistrationPin(rawPin),
      pinMode: 'user_provided' as const,
      generated: false,
    };
  }

  const storedPin = getStoredWhatsAppRegistrationPin(metadata);

  if (storedPin) {
    return {
      pin: storedPin,
      pinMode: 'stored' as const,
      generated: false,
    };
  }

  return {
    pin: generateMetaRegistrationPin(),
    pinMode: 'system_generated' as const,
    generated: true,
  };
}

async function registerWhatsAppBusinessPhoneNumber(
  accessToken: string,
  phoneNumberId: string,
  pin: string,
) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/register`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      pin,
    }),
  });

  let payload:
    | {
        success?: boolean;
        error?: {
          message?: string;
          error_user_msg?: string;
          error_data?: {
            details?: string;
          };
          code?: number;
        };
      }
    | null = null;

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload?.error?.error_data?.details ||
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      '';

    if (
      typeof errorMessage === 'string' &&
      errorMessage.toLowerCase().includes('already registered')
    ) {
      return {
        alreadyRegistered: true as const,
      };
    }

    throw buildMetaApiError(response, payload);
  }

  if (payload?.success === false) {
    throw new Error('Meta did not confirm the WhatsApp sender registration.');
  }

  return {
    alreadyRegistered: false as const,
  };
}

function getWhatsAppRegistrationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === 'string' && error.trim()
    ? error
    : 'Failed to register the WhatsApp sender with Meta.';
}

function isWhatsAppRegistrationPinMismatchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  return (
    normalized.includes('133005') ||
    normalized.includes('pin mismatch') ||
    normalized.includes('wrong pin')
  );
}

function shouldAutoRegisterApprovedDisplayName(
  row: Record<string, unknown>,
  phoneSnapshot: {
    verified_name?: string;
    name_status?: string;
  },
) {
  const metadata = getMetaChannelMetadataRecord(row);
  const autoRegistration = isRecord(metadata.autoRegistration)
    ? (metadata.autoRegistration as Record<string, unknown>)
    : {};
  const displayNameApproval = isRecord(metadata.displayNameApproval)
    ? (metadata.displayNameApproval as Record<string, unknown>)
    : {};
  const displayNameRequest = isRecord(metadata.displayNameRequest)
    ? (metadata.displayNameRequest as Record<string, unknown>)
    : {};
  const status =
    getDisplayNameStatus(phoneSnapshot.name_status) ||
    getDisplayNameStatus(displayNameApproval.status) ||
    getDisplayNameStatus(displayNameRequest.status);

  if (status !== 'APPROVED') {
    return false;
  }

  if (
    normalizeOptionalString(autoRegistration.status) === 'failed' &&
    normalizeOptionalString(autoRegistration.reason) === 'display_name_approved'
  ) {
    const lastAttemptedAt = normalizeOptionalString(autoRegistration.lastAttemptedAt);
    const lastAttemptedAtMs = lastAttemptedAt ? Date.parse(lastAttemptedAt) : Number.NaN;
    const retryAfterMs = 30 * 60 * 1000;

    if (Number.isFinite(lastAttemptedAtMs) && Date.now() - lastAttemptedAtMs < retryAfterMs) {
      return false;
    }
  }

  const requestedName =
    normalizeOptionalString(displayNameRequest.requestedName) ||
    normalizeOptionalString(phoneSnapshot.verified_name);
  const registeredName = normalizeOptionalString(displayNameApproval.registeredName);
  const registeredAt = normalizeOptionalString(displayNameApproval.registeredAt);
  const registrationReference =
    normalizeOptionalString(displayNameApproval.approvedAt) ||
    normalizeOptionalString(displayNameRequest.approvedAt) ||
    normalizeOptionalString(displayNameRequest.requestedAt) ||
    normalizeOptionalString(displayNameApproval.lastCheckedAt);

  if (!registeredAt) {
    return true;
  }

  if (registrationReference) {
    const registeredAtMs = Date.parse(registeredAt);
    const referenceMs = Date.parse(registrationReference);

    if (Number.isFinite(registeredAtMs) && Number.isFinite(referenceMs) && registeredAtMs < referenceMs) {
      return true;
    }
  }

  return Boolean(requestedName && registeredName && requestedName !== registeredName);
}

async function autoRegisterWhatsAppSenderForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  rawPin?: unknown;
  reason: 'channel_connected' | 'display_name_approved' | 'manual';
  throwOnError?: boolean;
}) {
  const currentMetadata = getMetaChannelMetadataRecord(args.row);
  const { pin, pinMode, generated } = resolveWhatsAppRegistrationPin(currentMetadata, args.rawPin);
  const pinCiphertext = encryptSecretValue(pin);
  const attemptedAt = new Date().toISOString();
  const currentAutoRegistration = isRecord(currentMetadata.autoRegistration)
    ? (currentMetadata.autoRegistration as Record<string, unknown>)
    : {};
  const currentTwoStepVerification = isRecord(currentMetadata.twoStepVerification)
    ? (currentMetadata.twoStepVerification as Record<string, unknown>)
    : {};
  const currentDisplayNameApproval = isRecord(currentMetadata.displayNameApproval)
    ? (currentMetadata.displayNameApproval as Record<string, unknown>)
    : {};
  const currentDisplayNameRequest = isRecord(currentMetadata.displayNameRequest)
    ? (currentMetadata.displayNameRequest as Record<string, unknown>)
    : null;

  try {
    let pinResetBeforeRegistration = false;
    let registration: Awaited<ReturnType<typeof registerWhatsAppBusinessPhoneNumber>>;

    try {
      registration = await registerWhatsAppBusinessPhoneNumber(
        args.accessToken,
        String(args.row.phone_number_id),
        pin,
      );
    } catch (error) {
      if (!isWhatsAppRegistrationPinMismatchError(error)) {
        throw error;
      }

      await updateWhatsAppBusinessPhoneNumberTwoStepVerification(
        args.accessToken,
        String(args.row.phone_number_id),
        pin,
      );
      pinResetBeforeRegistration = true;
      registration = await registerWhatsAppBusinessPhoneNumber(
        args.accessToken,
        String(args.row.phone_number_id),
        pin,
      );
    }

    const [phone, waba] = await Promise.all([
      fetchPhoneNumber(args.accessToken, String(args.row.phone_number_id)),
      fetchWaba(args.accessToken, String(args.row.waba_id)),
    ]);
    const registeredName =
      normalizeOptionalString(currentDisplayNameRequest?.requestedName) ||
      normalizeOptionalString(phone.verified_name);
    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      autoRegistration: {
        ...currentAutoRegistration,
        status: 'registered',
        reason: args.reason,
        lastAttemptedAt: attemptedAt,
        lastRegisteredAt: attemptedAt,
        alreadyRegistered: registration.alreadyRegistered,
        lastError: null,
        pinMode,
        pinResetBeforeRegistration,
      },
      senderRegistration: {
        registeredAt: attemptedAt,
        deregisteredAt: null,
        pinMode,
        reason: args.reason,
        alreadyRegistered: registration.alreadyRegistered,
        pinResetBeforeRegistration,
      },
      twoStepVerification: {
        ...currentTwoStepVerification,
        enabledAt: normalizeOptionalString(currentTwoStepVerification.enabledAt) || attemptedAt,
        lastPinUpdatedAt:
          pinMode === 'stored' && !pinResetBeforeRegistration
            ? normalizeOptionalString(currentTwoStepVerification.lastPinUpdatedAt) || attemptedAt
            : attemptedAt,
        pinMode,
        pinCiphertext,
        systemGeneratedAt: generated
          ? attemptedAt
          : normalizeOptionalString(currentTwoStepVerification.systemGeneratedAt),
        disabledAt: null,
      },
    };

    if (args.reason === 'display_name_approved') {
      nextMetadata.displayNameApproval = {
        ...currentDisplayNameApproval,
        status: 'APPROVED',
        registeredAt: attemptedAt,
        registeredName,
        registrationError: null,
      };

      if (currentDisplayNameRequest) {
        nextMetadata.displayNameRequest = {
          ...currentDisplayNameRequest,
          status: 'APPROVED',
          registeredAt: attemptedAt,
          registeredName,
          registrationError: null,
        };
      }
    }

    const { data, error } = await adminSupabase
      .from('meta_channels')
      .update({
        status: 'connected',
        display_phone_number: phone.display_phone_number || null,
        verified_name: phone.verified_name || null,
        quality_rating: phone.quality_rating || null,
        messaging_limit_tier: getNormalizedMessagingLimitTier(phone),
        business_account_name: waba.name || null,
        metadata: nextMetadata,
        last_synced_at: attemptedAt,
        updated_at: attemptedAt,
      })
      .eq('user_id', args.userId)
      .eq('id', args.row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return {
      row: data as Record<string, unknown>,
      phone,
    };
  } catch (error) {
    const message = getWhatsAppRegistrationErrorMessage(error);
    const nextMetadata: Record<string, unknown> = {
      ...currentMetadata,
      autoRegistration: {
        ...currentAutoRegistration,
        status: 'failed',
        reason: args.reason,
        lastAttemptedAt: attemptedAt,
        lastError: message,
        pinMode,
      },
      twoStepVerification: {
        ...currentTwoStepVerification,
        pinMode,
        pinCiphertext,
        systemGeneratedAt: generated
          ? attemptedAt
          : normalizeOptionalString(currentTwoStepVerification.systemGeneratedAt),
      },
    };

    if (args.reason === 'display_name_approved') {
      nextMetadata.displayNameApproval = {
        ...currentDisplayNameApproval,
        registrationError: message,
        lastRegistrationAttemptAt: attemptedAt,
      };

      if (currentDisplayNameRequest) {
        nextMetadata.displayNameRequest = {
          ...currentDisplayNameRequest,
          registrationError: message,
          lastRegistrationAttemptAt: attemptedAt,
        };
      }
    }

    const { data, error: persistError } = await adminSupabase
      .from('meta_channels')
      .update({
        metadata: nextMetadata,
        updated_at: attemptedAt,
      })
      .eq('user_id', args.userId)
      .eq('id', args.row.id)
      .select('*')
      .single();

    if (persistError) {
      console.error('Failed to persist WhatsApp registration failure:', persistError);
    }

    if (args.throwOnError) {
      throw error;
    }

    console.error('Automatic WhatsApp sender registration failed:', error);
    return {
      row: (data as Record<string, unknown>) || args.row,
      phone: null,
    };
  }
}

async function maybeAutoRegisterApprovedDisplayName(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  phone: {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
    messaging_limit_tier?: string;
    name_status?: string;
  };
}) {
  if (!shouldAutoRegisterApprovedDisplayName(args.row, args.phone)) {
    return {
      row: args.row,
      phone: args.phone,
    };
  }

  const registration = await autoRegisterWhatsAppSenderForChannel({
    userId: args.userId,
    row: args.row,
    accessToken: args.accessToken,
    reason: 'display_name_approved',
  });

  return {
    row: registration.row,
    phone: registration.phone || args.phone,
  };
}

async function updateWhatsAppBusinessPhoneNumberTwoStepVerification(
  accessToken: string,
  phoneNumberId: string,
  pin: string,
) {
  const response = await metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: phoneNumberId,
    method: 'POST',
    body: {
      pin,
    },
  });

  if (response.success === false) {
    throw new Error('Meta did not confirm the two-step verification PIN update.');
  }
}

async function requestWhatsAppBusinessPhoneNumberVerificationCode(
  accessToken: string,
  phoneNumberId: string,
  input: {
    codeMethod: 'SMS' | 'VOICE';
    language: string;
  },
) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/request_code`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code_method: input.codeMethod,
      language: input.language,
    }),
  });

  let payload:
    | {
        success?: boolean;
        error?: {
          message?: string;
          error_user_msg?: string;
          error_data?: {
            details?: string;
          };
          code?: number;
        };
      }
    | null = null;

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw buildMetaApiError(response, payload);
  }

  if (payload?.success === false) {
    throw new Error('Meta did not confirm the verification code request.');
  }
}

async function verifyWhatsAppBusinessPhoneNumberVerificationCode(
  accessToken: string,
  phoneNumberId: string,
  code: string,
) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/verify_code`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
    }),
  });

  let payload:
    | {
        success?: boolean;
        id?: string;
        error?: {
          message?: string;
          error_user_msg?: string;
          error_data?: {
            details?: string;
          };
          code?: number;
        };
      }
    | null = null;

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw buildMetaApiError(response, payload);
  }

  if (payload?.success === false) {
    throw new Error('Meta did not confirm the verification code.');
  }

  return {
    id: normalizeOptionalIdentifier(payload?.id),
  };
}

async function deregisterWhatsAppBusinessPhoneNumber(
  accessToken: string,
  phoneNumberId: string,
) {
  const url = new URL(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/deregister`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  let payload:
    | {
        success?: boolean;
        error?: {
          message?: string;
          error_user_msg?: string;
          error_data?: {
            details?: string;
          };
          code?: number;
        };
      }
    | null = null;

  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload?.error?.error_data?.details ||
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      '';

    if (
      typeof errorMessage === 'string' &&
      (errorMessage.toLowerCase().includes('already deregistered') ||
        errorMessage.toLowerCase().includes('not registered'))
    ) {
      return {
        alreadyDeregistered: true as const,
      };
    }

    throw buildMetaApiError(response, payload);
  }

  if (payload?.success === false) {
    throw new Error('Meta did not confirm the WhatsApp sender deregistration.');
  }

  return {
    alreadyDeregistered: false as const,
  };
}

function normalizeCallPermissionStatus(value: unknown): WhatsAppCallPermissionResponse['permission']['status'] {
  if (value === 'granted' || value === 'pending' || value === 'denied' || value === 'expired') {
    return value;
  }

  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'denied';
}

function normalizeCallActionName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'unknown';
}

async function fetchCallPermissions(
  accessToken: string,
  phoneNumberId: string,
  userWaId: string,
): Promise<WhatsAppCallPermissionResponse> {
  const normalizedUserWaId = normalizePhoneLike(userWaId);

  if (!normalizedUserWaId) {
    throw new Error('A valid WhatsApp user ID is required to check call permissions.');
  }

  const response = await metaRequestDetailed<{
    messaging_product?: string;
    permission?: {
      status?: string;
      expiration_time?: number;
    };
    actions?: Array<{
      action_name?: string;
      can_perform_action?: boolean;
      limits?: Array<{
        time_period?: string;
        current_usage?: number;
        max_allowed?: number;
        limit_expiration_time?: number;
      }>;
    }>;
  }>({
    accessToken,
    path: `${phoneNumberId}/call_permissions`,
    query: {
      user_wa_id: normalizedUserWaId,
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product) || 'whatsapp',
    permission: {
      status: normalizeCallPermissionStatus(response.permission?.status),
      expirationTime:
        typeof response.permission?.expiration_time === 'number'
          ? response.permission.expiration_time
          : null,
    },
    actions: Array.isArray(response.actions)
      ? response.actions.map((action) => ({
          actionName: normalizeCallActionName(action.action_name),
          canPerformAction: Boolean(action.can_perform_action),
          limits: Array.isArray(action.limits)
            ? action.limits.map((limit) => ({
                timePeriod: typeof limit.time_period === 'string' ? limit.time_period : 'unknown',
                currentUsage: Number(limit.current_usage || 0),
                maxAllowed: Number(limit.max_allowed || 0),
                limitExpirationTime:
                  typeof limit.limit_expiration_time === 'number'
                    ? limit.limit_expiration_time
                    : null,
              }))
            : [],
        }))
      : [],
  };
}

function normalizeCallSettingStatusValue(
  value: unknown,
  fallback: WhatsAppCallSettings['status'] = 'disabled',
): WhatsAppCallSettings['status'] {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (normalized === 'enabled' || normalized === 'disabled') {
    return normalized;
  }

  return normalized || fallback;
}

function normalizeCallIconVisibilityValue(
  value: unknown,
  fallback: WhatsAppCallSettings['callIconVisibility'] = 'hidden',
): WhatsAppCallSettings['callIconVisibility'] {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === 'hidden' || normalized === 'hide_in_chat' || normalized === 'disable_all') {
    return 'hidden';
  }

  if (normalized === 'visible' || normalized === 'default') {
    return 'visible';
  }

  return normalized;
}

function toMetaCallSettingStatus(value: unknown, fallback: WhatsAppCallSettings['status'] = 'disabled') {
  return normalizeCallSettingStatusValue(value, fallback).toUpperCase();
}

function toMetaCallIconVisibilityValue(
  value: unknown,
  fallback: WhatsAppCallSettings['callIconVisibility'] = 'hidden',
) {
  const normalized = normalizeCallIconVisibilityValue(value, fallback);

  if (normalized === 'visible') {
    return 'DEFAULT';
  }

  if (normalized === 'hidden') {
    return 'DISABLE_ALL';
  }

  return normalized.toUpperCase();
}

function normalizeMetaCallTime(value: unknown, fieldName: string) {
  const normalized = normalizeOptionalString(value)?.replace(':', '');

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  if (!/^\d{4}$/.test(normalized)) {
    throw new Error(`${fieldName} must use HHMM or HH:MM format.`);
  }

  const hours = Number(normalized.slice(0, 2));
  const minutes = Number(normalized.slice(2, 4));

  if (hours > 23 || minutes > 59) {
    throw new Error(`${fieldName} must be a valid 24-hour time.`);
  }

  return normalized;
}

function normalizeMetaCallDate(value: unknown, fieldName: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  return normalized;
}

function mapCallHoursWindow(entry: unknown) {
  if (!isRecord(entry)) {
    return null;
  }

  const dayOfWeek = normalizeOptionalString(entry.day_of_week ?? entry.dayOfWeek);
  const openTime = normalizeOptionalString(entry.open_time ?? entry.openTime);
  const closeTime = normalizeOptionalString(entry.close_time ?? entry.closeTime);

  if (!dayOfWeek || !openTime || !closeTime) {
    return null;
  }

  return {
    dayOfWeek,
    openTime,
    closeTime,
  };
}

function mapCallHolidaySchedule(entry: unknown) {
  if (!isRecord(entry)) {
    return null;
  }

  const date = normalizeOptionalString(entry.date);
  const startTime = normalizeOptionalString(entry.start_time ?? entry.startTime);
  const endTime = normalizeOptionalString(entry.end_time ?? entry.endTime);

  if (!date || !startTime || !endTime) {
    return null;
  }

  return {
    date,
    startTime,
    endTime,
  };
}

function mapCallHoursSettings(raw: unknown): WhatsAppCallSettings['callHours'] {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    status: normalizeCallSettingStatusValue(raw.status),
    timezoneId: normalizeOptionalString(raw.timezone_id ?? raw.timezoneId ?? raw.timezone),
    weeklyOperatingHours: Array.isArray(raw.weekly_operating_hours ?? raw.weeklyOperatingHours)
      ? ((raw.weekly_operating_hours ?? raw.weeklyOperatingHours) as unknown[])
          .map((entry) => mapCallHoursWindow(entry))
          .filter((entry): entry is NonNullable<ReturnType<typeof mapCallHoursWindow>> => Boolean(entry))
      : [],
    holidaySchedule: Array.isArray(raw.holiday_schedule ?? raw.holidaySchedule)
      ? ((raw.holiday_schedule ?? raw.holidaySchedule) as unknown[])
          .map((entry) => mapCallHolidaySchedule(entry))
          .filter((entry): entry is NonNullable<ReturnType<typeof mapCallHolidaySchedule>> => Boolean(entry))
      : [],
    raw,
  };
}

function getCallingSettingsRecord(raw: Record<string, unknown>) {
  const firstDataRow = Array.isArray(raw.data) && isRecord(raw.data[0]) ? raw.data[0] : null;
  const container = firstDataRow || raw;
  return isRecord(container.calling) ? (container.calling as Record<string, unknown>) : {};
}

function mapCallSettings(
  raw: Record<string, unknown>,
  channelRow: Record<string, unknown>,
): WhatsAppCallSettings {
  const calling = getCallingSettingsRecord(raw);

  return {
    phoneNumberId: String(channelRow.phone_number_id),
    status: normalizeCallSettingStatusValue(calling.status),
    callIconVisibility: normalizeCallIconVisibilityValue(calling.call_icon_visibility),
    callbackPermissionStatus: normalizeCallSettingStatusValue(calling.callback_permission_status),
    callHours: mapCallHoursSettings(calling.call_hours),
    raw: calling,
  };
}

async function fetchCallSettings(
  accessToken: string,
  phoneNumberId: string,
  channelRow: Record<string, unknown>,
): Promise<WhatsAppCallSettings> {
  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${phoneNumberId}/settings`,
  });

  return mapCallSettings(response, channelRow);
}

function normalizeCallHoursUpdateInput(input: NonNullable<WhatsAppCallSettingsUpdateInput['callHours']>) {
  const status = normalizeCallSettingStatusValue(input.status);
  const timezoneId = normalizeOptionalString(input.timezoneId);
  const weeklyOperatingHours = Array.isArray(input.weeklyOperatingHours)
    ? input.weeklyOperatingHours
        .map((entry) => {
          const dayOfWeek = normalizeOptionalString(entry.dayOfWeek)?.toUpperCase();

          if (!dayOfWeek) {
            return null;
          }

          return {
            day_of_week: dayOfWeek,
            open_time: normalizeMetaCallTime(entry.openTime, 'openTime'),
            close_time: normalizeMetaCallTime(entry.closeTime, 'closeTime'),
          };
        })
        .filter(
          (entry): entry is { day_of_week: string; open_time: string; close_time: string } =>
            Boolean(entry),
        )
    : [];

  if (!timezoneId) {
    throw new Error('A timezone is required for call hours.');
  }

  if (weeklyOperatingHours.length === 0) {
    throw new Error('At least one weekly call hour window is required for call hours.');
  }

  const payload: Record<string, unknown> = {
    status: toMetaCallSettingStatus(status),
    timezone_id: timezoneId,
    weekly_operating_hours: weeklyOperatingHours,
  };

  const holidaySchedule = Array.isArray(input.holidaySchedule)
    ? input.holidaySchedule
        .map((entry) => ({
          date: normalizeMetaCallDate(entry.date, 'date'),
          start_time: normalizeMetaCallTime(entry.startTime, 'startTime'),
          end_time: normalizeMetaCallTime(entry.endTime, 'endTime'),
        }))
        .filter((entry) => entry.date)
    : [];

  if (holidaySchedule.length > 0) {
    payload.holiday_schedule = holidaySchedule;
  }

  return payload;
}

function normalizeCallSettingsUpdateInput(
  input: WhatsAppCallSettingsUpdateInput,
  current: WhatsAppCallSettings,
) {
  if (!input || typeof input !== 'object') {
    throw new Error('Call settings payload is required.');
  }

  const payload: Record<string, unknown> = {};

  if ('status' in input) {
    payload.status = toMetaCallSettingStatus(input.status, current.status);
  }

  if ('callIconVisibility' in input) {
    payload.call_icon_visibility = toMetaCallIconVisibilityValue(
      input.callIconVisibility,
      current.callIconVisibility,
    );
  }

  if ('callbackPermissionStatus' in input) {
    payload.callback_permission_status = toMetaCallSettingStatus(
      input.callbackPermissionStatus,
      current.callbackPermissionStatus,
    );
  }

  if ('callHours' in input) {
    payload.call_hours = input.callHours
      ? normalizeCallHoursUpdateInput(input.callHours)
      : null;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('At least one call setting must be provided.');
  }

  if (!payload.status) {
    payload.status = toMetaCallSettingStatus(current.status || 'disabled');
  }

  return payload;
}

async function updateCallSettings(
  accessToken: string,
  phoneNumberId: string,
  channelRow: Record<string, unknown>,
  input: WhatsAppCallSettingsUpdateInput,
): Promise<WhatsAppCallSettings> {
  const current = await fetchCallSettings(accessToken, phoneNumberId, channelRow);
  const calling = normalizeCallSettingsUpdateInput(input, current);

  await metaRequestDetailed<{ success?: boolean }>({
    accessToken,
    path: `${phoneNumberId}/settings`,
    method: 'POST',
    body: {
      calling,
    },
  });

  return fetchCallSettings(accessToken, phoneNumberId, channelRow);
}

function normalizeBlockedUsersPayload(users: unknown) {
  if (!Array.isArray(users)) {
    throw new Error('At least one WhatsApp user is required.');
  }

  const normalizedUsers = Array.from(
    new Set(
      users
        .map((value) => normalizePhoneLike(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!normalizedUsers.length) {
    throw new Error('At least one valid WhatsApp user is required.');
  }

  return normalizedUsers;
}

function mapBlockedUserRecord(entry: Record<string, unknown>): WhatsAppBlockedUser | null {
  const waId = normalizePhoneLike(entry.wa_id);

  if (!waId) {
    return null;
  }

  return {
    messagingProduct: normalizeOptionalString(entry.messaging_product),
    waId,
  };
}

function mapBlockedUserOperationRecord(entry: Record<string, unknown>) {
  return {
    input: normalizeOptionalString(entry.input),
    waId: normalizePhoneLike(entry.wa_id),
  };
}

async function fetchBlockedUsers(
  accessToken: string,
  phoneNumberId: string,
  after?: string | null,
): Promise<WhatsAppBlockedUsersResponse> {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
    paging?: {
      cursors?: {
        after?: string;
        before?: string;
      };
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    query: {
      after: normalizeOptionalString(after) || undefined,
    },
  });

  const data = Array.isArray(response.data)
    ? response.data
        .map((entry) => mapBlockedUserRecord(entry))
        .filter((entry): entry is WhatsAppBlockedUser => Boolean(entry))
    : [];

  return {
    data,
    paging: response.paging?.cursors
      ? {
          after: normalizeOptionalString(response.paging.cursors.after),
          before: normalizeOptionalString(response.paging.cursors.before),
        }
      : null,
  };
}

async function fetchAllBlockedUsers(
  accessToken: string,
  phoneNumberId: string,
): Promise<WhatsAppBlockedUsersResponse> {
  const users: WhatsAppBlockedUser[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchBlockedUsers(accessToken, phoneNumberId, after);

    for (const entry of response.data) {
      if (seen.has(entry.waId)) {
        continue;
      }

      seen.add(entry.waId);
      users.push(entry);
    }

    after = response.paging?.after || null;

    if (!after) {
      break;
    }
  }

  return {
    data: users,
    paging: null,
  };
}

async function blockUsers(
  accessToken: string,
  phoneNumberId: string,
  users: string[],
): Promise<WhatsAppBlockedUsersMutationResponse> {
  const normalizedUsers = normalizeBlockedUsersPayload(users);
  const response = await metaRequestDetailed<{
    messaging_product?: string;
    block_users?: {
      added_users?: Array<Record<string, unknown>>;
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      block_users: normalizedUsers.map((user) => ({ user })),
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    users: Array.isArray(response.block_users?.added_users)
      ? response.block_users.added_users.map((entry) => mapBlockedUserOperationRecord(entry))
      : [],
  };
}

async function unblockUsers(
  accessToken: string,
  phoneNumberId: string,
  users: string[],
): Promise<WhatsAppBlockedUsersMutationResponse> {
  const normalizedUsers = normalizeBlockedUsersPayload(users);
  const response = await metaRequestDetailed<{
    messaging_product?: string;
    block_users?: {
      removed_users?: Array<Record<string, unknown>>;
    };
  }>({
    accessToken,
    path: `${phoneNumberId}/block_users`,
    method: 'DELETE',
    body: {
      messaging_product: 'whatsapp',
      block_users: normalizedUsers.map((user) => ({ user })),
    },
  });

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    users: Array.isArray(response.block_users?.removed_users)
      ? response.block_users.removed_users.map((entry) => mapBlockedUserOperationRecord(entry))
      : [],
  };
}

function normalizeActivitiesLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.min(100, Math.max(1, Math.trunc(parsed)));
}

function normalizeActivitiesListFilter(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((entry) => String(entry).split(','))
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

function normalizeWhatsAppBusinessActivitiesFilters(
  input: WhatsAppBusinessActivitiesFilters,
): Required<Pick<WhatsAppBusinessActivitiesFilters, 'limit'>> & WhatsAppBusinessActivitiesFilters {
  return {
    limit: normalizeActivitiesLimit(input.limit),
    after: normalizeOptionalString(input.after) || undefined,
    before: normalizeOptionalString(input.before) || undefined,
    since: normalizeOptionalString(input.since) || undefined,
    until: normalizeOptionalString(input.until) || undefined,
    activityType: normalizeActivitiesListFilter(input.activityType),
  };
}

function mapWhatsAppBusinessActivityRecord(
  entry: Record<string, unknown>,
): WhatsAppBusinessAccountActivity | null {
  const id = normalizeOptionalIdentifier(entry.id);
  const activityType = normalizeOptionalString(entry.activity_type);
  const timestamp = normalizeOptionalString(entry.timestamp);
  const actorType = normalizeOptionalString(entry.actor_type);

  if (!id || !activityType || !timestamp || !actorType) {
    return null;
  }

  return {
    id,
    activityType,
    timestamp,
    actorType,
    actorId: normalizeOptionalIdentifier(entry.actor_id),
    actorName: normalizeOptionalString(entry.actor_name),
    description: normalizeOptionalString(entry.description),
    details: isRecord(entry.details) ? entry.details : null,
    ipAddress: normalizeOptionalString(entry.ip_address),
    userAgent: normalizeOptionalString(entry.user_agent),
  };
}

async function fetchWhatsAppBusinessActivities(
  accessToken: string,
  wabaId: string,
  filters: WhatsAppBusinessActivitiesFilters,
): Promise<WhatsAppBusinessActivitiesResponse> {
  const normalizedFilters = normalizeWhatsAppBusinessActivitiesFilters(filters);
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
    paging?: {
      cursors?: {
        before?: string;
        after?: string;
      };
      previous?: string;
      next?: string;
    };
  }>({
    accessToken,
    path: `${wabaId}/activities`,
    query: {
      fields:
        'id,activity_type,timestamp,actor_type,actor_id,actor_name,description,details,ip_address,user_agent',
      limit: normalizedFilters.limit,
      after: normalizedFilters.after,
      before: normalizedFilters.before,
      since: normalizedFilters.since,
      until: normalizedFilters.until,
      activity_type:
        normalizedFilters.activityType && normalizedFilters.activityType.length > 0
          ? normalizedFilters.activityType.join(',')
          : undefined,
    },
  });

  return {
    wabaId,
    activities: Array.isArray(response.data)
      ? response.data
          .map((entry) => mapWhatsAppBusinessActivityRecord(entry))
          .filter((entry): entry is WhatsAppBusinessAccountActivity => Boolean(entry))
      : [],
    paging: {
      before: normalizeOptionalString(response.paging?.cursors?.before),
      after: normalizeOptionalString(response.paging?.cursors?.after),
      previous: normalizeOptionalString(response.paging?.previous),
      next: normalizeOptionalString(response.paging?.next),
    },
    fetchedAt: new Date().toISOString(),
  };
}

async function manageRemoteCall(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppCallManageInput,
): Promise<WhatsAppCallManageResponse> {
  const normalizedTo = normalizePhoneLike(input.to);
  const normalizedCallId = normalizeOptionalString(input.callId);
  const normalizedCallbackData = normalizeEditableString(input.bizOpaqueCallbackData);
  const normalizedSessionSdp = normalizeSdpString(input.session?.sdp);
  const sessionType = input.session?.sdpType;
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    action: input.action,
  };

  if (input.action === 'connect') {
    if (!normalizedTo) {
      throw new Error('A WhatsApp user ID is required to start a call.');
    }

    if (sessionType !== 'offer' || !normalizedSessionSdp) {
      throw new Error('An SDP offer is required to start a call.');
    }
  }

  if (input.action === 'accept') {
    if (!normalizedCallId && !normalizedTo) {
      throw new Error('A call ID or WhatsApp user ID is required to accept a call.');
    }

    if (sessionType !== 'answer' || !normalizedSessionSdp) {
      throw new Error('An SDP answer is required to accept a call.');
    }
  }

  if ((input.action === 'pre_accept' || input.action === 'reject') && !normalizedCallId && !normalizedTo) {
    throw new Error('A call ID or WhatsApp user ID is required for this call action.');
  }

  if (input.action === 'terminate' && !normalizedCallId) {
    throw new Error('A call ID is required to terminate a call.');
  }

  if (normalizedTo) {
    payload.to = normalizedTo;
  }

  if (normalizedCallId) {
    payload.call_id = normalizedCallId;
  }

  if (normalizedSessionSdp && sessionType) {
    payload.session = {
      sdp_type: sessionType,
      sdp: normalizedSessionSdp,
    };
  }

  if (normalizedCallbackData) {
    payload.biz_opaque_callback_data = normalizedCallbackData.slice(0, 512);
  }

  const response = await metaRequestDetailed<{
    messaging_product?: string;
    calls?: Array<{ id?: string }>;
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/calls`,
    method: 'POST',
    body: payload,
  });

  const callIds = Array.isArray(response.calls)
    ? response.calls
        .map((entry) => normalizeOptionalString(entry.id))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    messagingProduct: normalizeOptionalString(response.messaging_product),
    callId: callIds[0] || normalizedCallId || null,
    callIds,
    success: Boolean(response.success) || callIds.length > 0,
  };
}

async function fetchBusinessProfile(accessToken: string, phoneNumberId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_business_profile`,
    query: {
      fields: 'about,address,description,email,profile_picture_url,websites,vertical',
    },
  });

  return (response.data?.[0] || {}) as Record<string, unknown>;
}

async function fetchOfficialBusinessAccountStatus(accessToken: string, phoneNumberId: string) {
  const response = await metaRequest<{
    id?: string;
    is_official_business_account?: boolean;
    official_business_account?: {
      oba_status?: string;
      status_message?: string;
    };
  }>({
    accessToken,
    path: phoneNumberId,
    query: {
      fields: 'is_official_business_account,official_business_account',
    },
    version: officialBusinessAccountGraphVersion,
  });

  return {
    id: response.id || phoneNumberId,
    oba_status:
      response.official_business_account?.oba_status ||
      (response.is_official_business_account ? 'APPROVED' : undefined),
    status_message:
      response.official_business_account?.status_message ||
      (response.is_official_business_account
        ? 'This phone number is an approved Official Business Account.'
        : undefined),
  };
}

async function submitOfficialBusinessAccountUpdate(
  accessToken: string,
  phoneNumberId: string,
  payload: Record<string, unknown>,
) {
  return metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${phoneNumberId}/official_business_account`,
    method: 'POST',
    body: payload,
    version: officialBusinessAccountGraphVersion,
  });
}

function normalizeWhatsAppBusinessAppealStatus(value: unknown) {
  const status = normalizeOptionalString(value);
  return status ? status.toUpperCase() : null;
}

function normalizeUriInput(value: unknown, label: string) {
  const normalized = normalizeEditableString(value);

  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }

    return parsed.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
  }
}

function normalizeOfficialBusinessAccountUpdateInput(input: WhatsAppOfficialBusinessAccountUpdateInput) {
  if (!input || typeof input !== 'object') {
    throw new Error('Official Business Account application details are required.');
  }

  const businessWebsiteUrl = normalizeUriInput(
    input.businessWebsiteUrl ?? input.business_website_url,
    'businessWebsiteUrl',
  );
  const primaryCountryOfOperation = normalizeEditableString(
    input.primaryCountryOfOperation ?? input.primary_country_of_operation,
  );

  if (!businessWebsiteUrl) {
    throw new Error('businessWebsiteUrl is required.');
  }

  if (!primaryCountryOfOperation) {
    throw new Error('primaryCountryOfOperation is required.');
  }

  const supportingLinksInput = input.supportingLinks ?? input.supporting_links;
  const supportingLinks = Array.isArray(supportingLinksInput)
    ? supportingLinksInput
        .map((link) => normalizeUriInput(link, 'supportingLinks'))
        .filter((link): link is string => Boolean(link))
    : [];

  if (supportingLinks.length > 0 && (supportingLinks.length < 5 || supportingLinks.length > 10)) {
    throw new Error('supportingLinks must include between 5 and 10 URLs when provided.');
  }

  const payload: Record<string, unknown> = {
    business_website_url: businessWebsiteUrl,
    primary_country_of_operation: primaryCountryOfOperation,
  };
  const primaryLanguage = normalizeEditableString(input.primaryLanguage ?? input.primary_language);
  const parentBusinessOrBrand = normalizeEditableString(
    input.parentBusinessOrBrand ?? input.parent_business_or_brand,
  );
  const additionalSupportingInformation = normalizeEditableString(
    input.additionalSupportingInformation ?? input.additional_supporting_information,
  );

  if (primaryLanguage) payload.primary_language = primaryLanguage;
  if (parentBusinessOrBrand) payload.parent_business_or_brand = parentBusinessOrBrand;
  if (supportingLinks.length > 0) payload.supporting_links = supportingLinks;
  if (additionalSupportingInformation) {
    payload.additional_supporting_information = additionalSupportingInformation;
  }

  return payload;
}

function mapOfficialBusinessAccountStatus(
  raw: Record<string, unknown>,
  phoneNumberId: string,
  checkedAt: string,
  lastError?: string | null,
): WhatsAppOfficialBusinessAccountStatus {
  return {
    id: normalizeOptionalIdentifier(raw.id) || phoneNumberId,
    obaStatus: normalizeWhatsAppBusinessAppealStatus(raw.oba_status ?? raw.obaStatus),
    statusMessage: normalizeOptionalString(raw.status_message ?? raw.statusMessage),
    lastCheckedAt: checkedAt,
    lastError: normalizeOptionalString(lastError),
  };
}

function mapOfficialBusinessAccountUpdateResponse(
  raw: Record<string, unknown>,
  phoneNumberId: string,
  checkedAt: string,
): WhatsAppOfficialBusinessAccountUpdateResponse {
  const updatedStatus = isRecord(raw.updated_status)
    ? mapOfficialBusinessAccountStatus(raw.updated_status as Record<string, unknown>, phoneNumberId, checkedAt)
    : null;

  return {
    success: raw.success === true,
    message: normalizeOptionalString(raw.message),
    updatedStatus,
    trackingId: normalizeOptionalIdentifier(raw.tracking_id ?? raw.trackingId),
  };
}

function getStoredOfficialBusinessAccountStatus(
  metadata: unknown,
  phoneNumberId: string,
): WhatsAppOfficialBusinessAccountStatus | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const rawStatus =
    (isRecord(metadata.officialBusinessAccountStatus) &&
      (metadata.officialBusinessAccountStatus as Record<string, unknown>)) ||
    (isRecord(metadata.officialBusinessAccount) &&
      (metadata.officialBusinessAccount as Record<string, unknown>)) ||
    null;

  if (!rawStatus) {
    return null;
  }

  const status = mapOfficialBusinessAccountStatus(
    rawStatus,
    phoneNumberId,
    normalizeOptionalString(rawStatus.lastCheckedAt ?? rawStatus.last_checked_at) || '',
    normalizeOptionalString(rawStatus.lastError ?? rawStatus.last_error),
  );

  if (!status.obaStatus && !status.statusMessage && !status.lastError) {
    return null;
  }

  if (status.lastError && isUnsupportedOfficialBusinessAccountStatusError(status.lastError)) {
    return {
      ...status,
      statusMessage:
        status.statusMessage ||
        'Official Business Account status is not available from Meta for this phone number.',
      lastError: null,
    };
  }

  return status;
}

function isOfficialBusinessAccountStatusFresh(status: WhatsAppOfficialBusinessAccountStatus | null) {
  if (!status?.lastCheckedAt) {
    return false;
  }

  const checkedAtMs = Date.parse(status.lastCheckedAt);
  return Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs < obaStatusCacheTtlMs;
}

function isUnsupportedOfficialBusinessAccountStatusError(error: unknown) {
  const message = mapDbError(error).toLowerCase();
  return message.includes('official_business_account') && message.includes('nonexisting field');
}

async function persistOfficialBusinessAccountStatus(
  userId: string,
  channelId: unknown,
  status: WhatsAppOfficialBusinessAccountStatus,
) {
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .select('metadata')
    .eq('user_id', userId)
    .eq('id', channelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const metadata = isRecord(data?.metadata) ? { ...(data.metadata as Record<string, unknown>) } : {};

  const { error: updateError } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...metadata,
        officialBusinessAccountStatus: {
          id: status.id,
          obaStatus: status.obaStatus,
          statusMessage: status.statusMessage,
          lastCheckedAt: status.lastCheckedAt,
          lastError: status.lastError || null,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', channelId);

  if (updateError) {
    throw updateError;
  }
}

async function getOfficialBusinessAccountStatusForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  force?: boolean;
}) {
  const phoneNumberId = String(args.row.phone_number_id);
  const cachedStatus = getStoredOfficialBusinessAccountStatus(args.row.metadata, phoneNumberId);

  if (!args.force && isOfficialBusinessAccountStatusFresh(cachedStatus)) {
    return cachedStatus;
  }

  const checkedAt = new Date().toISOString();

  try {
    const remoteStatus = await fetchOfficialBusinessAccountStatus(args.accessToken, phoneNumberId);
    const status = mapOfficialBusinessAccountStatus(remoteStatus, phoneNumberId, checkedAt);

    await persistOfficialBusinessAccountStatus(args.userId, args.row.id, status).catch((error) => {
      console.error('Failed to persist WhatsApp OBA status:', error);
    });

    return status;
  } catch (error) {
    if (isUnsupportedOfficialBusinessAccountStatusError(error)) {
      const status: WhatsAppOfficialBusinessAccountStatus = {
        id: cachedStatus?.id || phoneNumberId,
        obaStatus: cachedStatus?.obaStatus || null,
        statusMessage:
          cachedStatus?.statusMessage ||
          'Official Business Account status is not available from Meta for this phone number.',
        lastCheckedAt: checkedAt,
        lastError: null,
      };

      await persistOfficialBusinessAccountStatus(args.userId, args.row.id, status).catch((persistError) => {
        console.error('Failed to persist WhatsApp OBA status fallback:', persistError);
      });

      return status;
    }

    const status: WhatsAppOfficialBusinessAccountStatus = {
      id: cachedStatus?.id || phoneNumberId,
      obaStatus: cachedStatus?.obaStatus || null,
      statusMessage: cachedStatus?.statusMessage || null,
      lastCheckedAt: checkedAt,
      lastError: mapDbError(error),
    };

    await persistOfficialBusinessAccountStatus(args.userId, args.row.id, status).catch((persistError) => {
      console.error('Failed to persist WhatsApp OBA status error:', persistError);
    });

    return status;
  }
}

async function submitOfficialBusinessAccountUpdateForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  input: WhatsAppOfficialBusinessAccountUpdateInput;
}) {
  const phoneNumberId = String(args.row.phone_number_id);
  const checkedAt = new Date().toISOString();
  const payload = normalizeOfficialBusinessAccountUpdateInput(args.input);
  const remoteResponse = await submitOfficialBusinessAccountUpdate(
    args.accessToken,
    phoneNumberId,
    payload,
  );
  const response = mapOfficialBusinessAccountUpdateResponse(remoteResponse, phoneNumberId, checkedAt);

  if (response.updatedStatus) {
    await persistOfficialBusinessAccountStatus(args.userId, args.row.id, response.updatedStatus).catch((error) => {
      console.error('Failed to persist WhatsApp OBA update status:', error);
    });
  }

  return response;
}

async function updateWhatsAppDisplayNameForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  input: WhatsAppDisplayNameUpdateInput;
}) {
  const displayName = normalizeWhatsAppDisplayName(args.input.displayName);
  const requestedAt = new Date().toISOString();
  const remoteResponse = await submitWhatsAppDisplayNameUpdate(
    args.accessToken,
    String(args.row.phone_number_id),
    displayName,
  );
  const currentMetadata = getMetaChannelMetadataRecord(args.row);

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...currentMetadata,
        displayNameRequest: {
          requestedName: displayName,
          requestedAt,
          status: 'SUBMITTED',
          lastError: null,
          registeredAt: null,
          registeredName: null,
          registrationError: null,
          response: remoteResponse,
        },
        displayNameApproval: {
          ...(isRecord(currentMetadata.displayNameApproval)
            ? (currentMetadata.displayNameApproval as Record<string, unknown>)
            : {}),
          status: 'SUBMITTED',
          lastCheckedAt: requestedAt,
          registeredAt: null,
          registeredName: null,
          registrationError: null,
        },
      },
      updated_at: requestedAt,
    })
    .eq('user_id', args.userId)
    .eq('id', args.row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function updateBusinessProfile(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppBusinessProfileUpdateInput,
) {
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
  };

  if ('about' in input) payload.about = normalizeEditableString(input.about) ?? '';
  if ('address' in input) payload.address = normalizeEditableString(input.address) ?? '';
  if ('description' in input) payload.description = normalizeEditableString(input.description) ?? '';
  if ('email' in input) payload.email = normalizeEditableString(input.email) ?? '';
  if ('profilePictureHandle' in input) {
    payload.profile_picture_handle = normalizeEditableString(input.profilePictureHandle) ?? '';
  }
  if ('vertical' in input) payload.vertical = normalizeWhatsAppBusinessVertical(input.vertical) ?? '';
  if ('websites' in input) payload.websites = normalizeWebsites(input.websites);

  await metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_business_profile`,
    method: 'POST',
    body: payload,
  });

  return fetchBusinessProfile(accessToken, phoneNumberId);
}

async function fetchCommerceSettings(accessToken: string, phoneNumberId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_commerce_settings`,
  });

  return (response.data?.[0] || {}) as Record<string, unknown>;
}

function normalizeCommerceSettingsInput(input: WhatsAppCommerceSettingsUpdateInput) {
  const normalized: {
    isCartEnabled?: boolean;
    isCatalogVisible?: boolean;
  } = {};

  if ('isCartEnabled' in input) {
    if (typeof input.isCartEnabled !== 'boolean') {
      throw new Error('isCartEnabled must be a boolean.');
    }

    normalized.isCartEnabled = input.isCartEnabled;
  }

  if ('isCatalogVisible' in input) {
    if (typeof input.isCatalogVisible !== 'boolean') {
      throw new Error('isCatalogVisible must be a boolean.');
    }

    normalized.isCatalogVisible = input.isCatalogVisible;
  }

  if (!('isCartEnabled' in normalized) && !('isCatalogVisible' in normalized)) {
    throw new Error('At least one commerce setting must be provided.');
  }

  return normalized;
}

async function updateCommerceSettings(
  accessToken: string,
  phoneNumberId: string,
  input: WhatsAppCommerceSettingsUpdateInput,
) {
  const normalizedInput = normalizeCommerceSettingsInput(input);

  await metaRequest<{
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/whatsapp_commerce_settings`,
    method: 'POST',
    query: {
      is_cart_enabled: normalizedInput.isCartEnabled,
      is_catalog_visible: normalizedInput.isCatalogVisible,
    },
  });

  return fetchCommerceSettings(accessToken, phoneNumberId);
}

async function configureConversationalAutomation(
  accessToken: string,
  phoneNumberId: string,
  input: Required<WhatsAppConversationalAutomationUpdateInput>,
) {
  const response = await metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: `${phoneNumberId}/conversational_automation`,
    method: 'POST',
    body: {
      enable_welcome_message: input.enableWelcomeMessage,
      prompts: input.prompts,
      commands: input.commands.map((command) => ({
        command_name: command.commandName,
        command_description: command.commandDescription,
      })),
    },
  });

  if (!response.success) {
    throw new Error('WhatsApp did not confirm the automation update.');
  }

  return response;
}

function isSupportedBusinessProfilePhotoMimeType(value: string | null | undefined) {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png';
}

async function createBusinessProfilePhotoUploadSession(
  accessToken: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  requireMetaAppCredentials();

  const response = await metaRequest<{ id?: string }>({
    accessToken,
    path: `${metaAppId}/uploads`,
    method: 'POST',
    query: {
      file_length: file.buffer.length,
      file_type: file.mimeType,
      file_name: file.fileName,
    },
  });

  const uploadId = normalizeOptionalString(response.id);

  if (!uploadId) {
    throw new Error('Meta did not return a profile photo upload session.');
  }

  return uploadId;
}

async function uploadBusinessProfilePhotoHandle(
  accessToken: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  const uploadId = await createBusinessProfilePhotoUploadSession(accessToken, file);
  const uploadUrl = `https://graph.facebook.com/${graphVersion}/${uploadId.replace(/^\/+/, '')}`;
  let lastError: Error | null = null;

  for (const authorization of [`OAuth ${accessToken}`, `Bearer ${accessToken}`]) {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        file_offset: '0',
        'Content-Type': file.mimeType,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      let message = `Profile photo upload failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as {
          error?: {
            message?: string;
          };
        };
        message = payload.error?.message || message;
      } catch {
        lastError = new Error(message);
        continue;
      }

      lastError = new Error(message);
      continue;
    }

    const payload = (await response.json()) as {
      h?: string;
      handle?: string;
    };
    const handle = normalizeOptionalString(payload.h) || normalizeOptionalString(payload.handle);

    if (!handle) {
      throw new Error('Meta did not return a profile photo handle.');
    }

    return handle;
  }

  throw lastError || new Error('Profile photo upload failed.');
}

async function fetchWaba(accessToken: string, wabaId: string) {
  return metaRequest<{
    id?: string;
    name?: string;
  }>({
    accessToken,
    path: wabaId,
    query: {
      fields: 'id,name',
    },
  });
}

async function fetchInstagramPages(accessToken: string) {
  const response = await metaRequest<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: {
        id?: string;
      } | null;
    }>;
  }>({
    accessToken,
    path: 'me/accounts',
    query: {
      fields: 'id,name,access_token,instagram_business_account{id}',
    },
  });

  return response.data || [];
}

async function fetchMessengerPages(accessToken: string) {
  const response = await metaRequestDetailed<{
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      picture?: unknown;
    }>;
  }>({
    accessToken,
    path: 'me/accounts',
    query: {
      fields: 'id,name,access_token,picture{url}',
    },
  });

  return response.data || [];
}

type ReusableMetaPageAsset = {
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageAccessToken: string | null;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  instagramName: string | null;
  instagramProfilePictureUrl: string | null;
};

type ReusableMetaSetupAssets = {
  pages: ReusableMetaPageAsset[];
  collectionError: string | null;
};

const META_SETUP_SENSITIVE_KEYS = new Set([
  'accesstoken',
  'token',
  'secret',
  'clientsecret',
  'appsecret',
  'code',
  'authorization',
  'authresponse',
  'signedrequest',
  'password',
  'cookie',
  'sessionkey',
  'apikey',
  'privatekey',
]);

function isSensitiveMetaSetupKey(key: string) {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    META_SETUP_SENSITIVE_KEYS.has(normalizedKey) ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('secret') ||
    normalizedKey === 'code'
  );
}

function sanitizeReusableMetaSetupValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= 6) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeReusableMetaSetupValue(item, depth + 1));
  }

  if (!isRecord(value)) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value).slice(0, 80)) {
    if (isSensitiveMetaSetupKey(key)) {
      continue;
    }

    sanitized[key] = sanitizeReusableMetaSetupValue(nestedValue, depth + 1);
  }

  return sanitized;
}

function addIdentifierValue(target: Set<string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      addIdentifierValue(target, item);
    }
    return;
  }

  const normalized = normalizeOptionalIdentifier(value);
  if (normalized) {
    target.add(normalized);
  }
}

function collectReusableMetaIdentifiers(value: unknown) {
  const identifiers = {
    businessIds: new Set<string>(),
    wabaIds: new Set<string>(),
    phoneNumberIds: new Set<string>(),
    pageIds: new Set<string>(),
    instagramAccountIds: new Set<string>(),
    adAccountIds: new Set<string>(),
    formIds: new Set<string>(),
    catalogIds: new Set<string>(),
  };

  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item);
      }
      return;
    }

    if (!isRecord(entry)) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(entry)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (
        normalizedKey === 'businessid' ||
        normalizedKey === 'businessmanagerid' ||
        normalizedKey === 'metabusinessid'
      ) {
        addIdentifierValue(identifiers.businessIds, nestedValue);
      } else if (
        normalizedKey === 'wabaid' ||
        normalizedKey === 'whatsappbusinessaccountid'
      ) {
        addIdentifierValue(identifiers.wabaIds, nestedValue);
      } else if (
        normalizedKey === 'phonenumberid' ||
        normalizedKey === 'whatsappphonenumberid'
      ) {
        addIdentifierValue(identifiers.phoneNumberIds, nestedValue);
      } else if (normalizedKey === 'pageid' || normalizedKey === 'pageids') {
        addIdentifierValue(identifiers.pageIds, nestedValue);
      } else if (
        normalizedKey === 'instagrambusinessaccountid' ||
        normalizedKey === 'instagramaccountid' ||
        normalizedKey === 'iguserid'
      ) {
        addIdentifierValue(identifiers.instagramAccountIds, nestedValue);
      } else if (normalizedKey === 'adaccountid' || normalizedKey === 'adaccountids') {
        addIdentifierValue(identifiers.adAccountIds, nestedValue);
      } else if (
        normalizedKey === 'formid' ||
        normalizedKey === 'formids' ||
        normalizedKey === 'leadgenformid'
      ) {
        addIdentifierValue(identifiers.formIds, nestedValue);
      } else if (normalizedKey === 'catalogid' || normalizedKey === 'catalogids') {
        addIdentifierValue(identifiers.catalogIds, nestedValue);
      }

      visit(nestedValue);
    }
  };

  visit(value);

  return {
    businessIds: Array.from(identifiers.businessIds),
    wabaIds: Array.from(identifiers.wabaIds),
    phoneNumberIds: Array.from(identifiers.phoneNumberIds),
    pageIds: Array.from(identifiers.pageIds),
    instagramAccountIds: Array.from(identifiers.instagramAccountIds),
    adAccountIds: Array.from(identifiers.adAccountIds),
    formIds: Array.from(identifiers.formIds),
    catalogIds: Array.from(identifiers.catalogIds),
  };
}

async function fetchReusableMetaSetupAssets(accessToken: string): Promise<ReusableMetaSetupAssets> {
  try {
    const response = await metaRequestDetailed<{
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        picture?: unknown;
        instagram_business_account?: {
          id?: string;
          username?: string;
          name?: string;
          profile_picture_url?: string;
        } | null;
      }>;
    }>({
      accessToken,
      path: 'me/accounts',
      query: {
        fields:
          'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
      },
    });

    const pages = (response.data || [])
      .map((page) => {
        const pageId = normalizeOptionalIdentifier(page.id);
        if (!pageId) {
          return null;
        }

        return {
          pageId,
          pageName: normalizeOptionalString(page.name),
          pagePictureUrl: getGraphPictureUrl(page.picture),
          pageAccessToken: normalizeOptionalString(page.access_token),
          instagramBusinessAccountId: normalizeOptionalIdentifier(
            page.instagram_business_account?.id,
          ),
          instagramUsername: normalizeOptionalString(
            page.instagram_business_account?.username,
          ),
          instagramName: normalizeOptionalString(page.instagram_business_account?.name),
          instagramProfilePictureUrl: normalizeOptionalString(
            page.instagram_business_account?.profile_picture_url,
          ),
        } satisfies ReusableMetaPageAsset;
      })
      .filter(Boolean) as ReusableMetaPageAsset[];

    return { pages, collectionError: null };
  } catch (error) {
    return { pages: [], collectionError: mapDbError(error) };
  }
}

function buildReusableMetaSetupContext(args: {
  source: 'waba_embedded_signup' | 'manual_waba_connection';
  setupType: string;
  connectionMethod: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  setupContext?: EmbeddedMetaConnectionInput['setupContext'] | null;
  reusableAssets?: ReusableMetaSetupAssets;
}) {
  const timestamp = new Date().toISOString();
  const sanitizedSetupContext = sanitizeReusableMetaSetupValue(args.setupContext || null);
  const setupContextRecord = isRecord(args.setupContext) ? args.setupContext : {};
  const flowState = normalizeOptionalString(setupContextRecord.flowState) || 'core_onboarding';
  const oauthState = normalizeOptionalString(setupContextRecord.oauthState);
  const identifiers = collectReusableMetaIdentifiers(sanitizedSetupContext);
  const pageAssets = args.reusableAssets?.pages || [];
  const pageIds = pageAssets.map((page) => page.pageId);
  const instagramAccountIds = pageAssets
    .map((page) => page.instagramBusinessAccountId)
    .filter(Boolean) as string[];

  return {
    source: args.source,
    flowState,
    oauthState,
    setupType: args.setupType,
    connectionMethod: args.connectionMethod,
    collectedAt: timestamp,
    updatedAt: timestamp,
    app: {
      appId:
        normalizeOptionalString(args.setupContext?.appId) ||
        metaAppId ||
        null,
      configId: normalizeOptionalString(args.setupContext?.configId),
      graphVersion:
        normalizeOptionalString(args.setupContext?.graphVersion) ||
        graphVersion,
    },
    identifiers: {
      businessIds: identifiers.businessIds,
      wabaIds: Array.from(new Set([args.wabaId, ...identifiers.wabaIds])),
      phoneNumberIds: Array.from(new Set([args.phoneNumberId, ...identifiers.phoneNumberIds])),
      pageIds: Array.from(new Set([...identifiers.pageIds, ...pageIds])),
      instagramAccountIds: Array.from(
        new Set([...identifiers.instagramAccountIds, ...instagramAccountIds]),
      ),
      adAccountIds: identifiers.adAccountIds,
      formIds: identifiers.formIds,
      catalogIds: identifiers.catalogIds,
    },
    connectedWhatsAppBusiness: {
      wabaId: args.wabaId,
      phoneNumberId: args.phoneNumberId,
      displayPhoneNumber: args.displayPhoneNumber,
      verifiedName: args.verifiedName,
      qualityRating: args.qualityRating,
      messagingLimitTier: args.messagingLimitTier,
      businessAccountName: args.businessAccountName,
    },
    reusableAssets: {
      pages: pageAssets.map((page) => ({
        pageId: page.pageId,
        pageName: page.pageName,
        pagePictureUrl: page.pagePictureUrl,
        hasPageAccessToken: Boolean(page.pageAccessToken),
        instagramBusinessAccountId: page.instagramBusinessAccountId,
        instagramUsername: page.instagramUsername,
        instagramName: page.instagramName,
        instagramProfilePictureUrl: page.instagramProfilePictureUrl,
      })),
      collectionError: args.reusableAssets?.collectionError || null,
    },
    tokenVault: {
      metaChannelAccessTokenStored: true,
      accessTokenLast4: last4(args.accessToken),
      storedAt: timestamp,
    },
    reuseTargets: {
      whatsappBusinessPlatform: true,
      messengerPlatform: pageAssets.length > 0,
      instagramDms: instagramAccountIds.length > 0,
      metaLeadCapture: pageAssets.length > 0,
      metaAds: identifiers.adAccountIds.length > 0 || identifiers.formIds.length > 0,
    },
    rawEmbeddedSignupContext:
      args.source === 'waba_embedded_signup' ? sanitizedSetupContext : null,
  };
}

function normalizeMetaAdAccountId(value: unknown) {
  const normalized = normalizeOptionalIdentifier(value);
  if (!normalized) {
    return null;
  }

  return normalized.startsWith('act_') ? normalized : `act_${normalized}`;
}

function getRawMetaAdAccountNumber(value: unknown) {
  const normalized = normalizeOptionalIdentifier(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/^act_/, '');
}

function isSameMetaAdAccountId(option: MetaAdsAdAccountOption, value: unknown) {
  const normalized = normalizeMetaAdAccountId(value);
  if (!normalized) {
    return false;
  }

  return (
    option.adAccountId === normalized ||
    normalizeMetaAdAccountId(option.accountId) === normalized ||
    normalizeMetaAdAccountId(option.adAccountId) === normalized
  );
}

function normalizeMetaAdAccountStatus(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function normalizeMetaOAuthFlowState(value: unknown) {
  const normalized = normalizeOptionalString(value);

  if (
    normalized === 'core_onboarding' ||
    normalized === 'ads_flow' ||
    normalized === 'catalog_flow' ||
    normalized === 'lead_capture_flow' ||
    normalized === 'instagram_flow' ||
    normalized === 'messenger_flow'
  ) {
    return normalized;
  }

  return null;
}

function assertMetaOAuthFlowState(value: unknown, expected: string) {
  const normalized = normalizeMetaOAuthFlowState(value);

  if (normalized && normalized !== expected) {
    throw new Error(`This Meta OAuth response belongs to "${normalized}", not "${expected}".`);
  }
}

async function fetchMetaAdsAssets(accessToken: string) {
  const [pagesResponse, adAccountsResponse, permissionsResponse] = await Promise.all([
    metaRequestDetailed<{
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        picture?: unknown;
        tasks?: string[];
      }>;
    }>({
      accessToken,
      path: 'me/accounts',
      query: {
        fields: 'id,name,access_token,picture{url},tasks',
      },
    }),
    metaRequestDetailed<{
      data?: Array<{
        id?: string;
        account_id?: string;
        name?: string;
        account_status?: number | string;
        currency?: string;
        timezone_name?: string;
        business?: {
          id?: string;
          name?: string;
        } | null;
      }>;
    }>({
      accessToken,
      path: 'me/adaccounts',
      query: {
        fields: 'id,account_id,name,account_status,currency,timezone_name,business{id,name}',
      },
    }),
    metaRequestDetailed<{
      data?: Array<{
        permission?: string;
        status?: string;
      }>;
    }>({
      accessToken,
      path: 'me/permissions',
    }),
  ]);

  const pages = (pagesResponse.data || [])
    .map((page) => {
      const pageId = normalizeOptionalIdentifier(page.id);
      if (!pageId) {
        return null;
      }

      return {
        pageId,
        pageName: normalizeOptionalString(page.name),
        pagePictureUrl: getGraphPictureUrl(page.picture),
        pageTasks: normalizeStringArray(page.tasks, { uppercase: true }),
        hasPageAccessToken: Boolean(normalizeOptionalString(page.access_token)),
      } satisfies MetaAdsPageOption;
    })
    .filter(Boolean) as MetaAdsPageOption[];

  const pageAccessTokens = new Map(
    (pagesResponse.data || [])
      .map((page) => {
        const pageId = normalizeOptionalIdentifier(page.id);
        const pageAccessToken = normalizeOptionalString(page.access_token);
        return pageId && pageAccessToken ? [pageId, pageAccessToken] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );

  const adAccounts = (adAccountsResponse.data || [])
    .map((account) => {
      const adAccountId = normalizeMetaAdAccountId(account.id || account.account_id);
      if (!adAccountId) {
        return null;
      }

      return {
        adAccountId,
        accountId: getRawMetaAdAccountNumber(account.account_id || account.id),
        name: normalizeOptionalString(account.name),
        accountStatus: normalizeMetaAdAccountStatus(account.account_status),
        currency: normalizeOptionalString(account.currency),
        timezoneName: normalizeOptionalString(account.timezone_name),
        businessId: normalizeOptionalIdentifier(account.business?.id),
        businessName: normalizeOptionalString(account.business?.name),
      } satisfies MetaAdsAdAccountOption;
    })
    .filter(Boolean) as MetaAdsAdAccountOption[];

  const permissions = (permissionsResponse.data || [])
    .filter((permission) => (permission.status || '').toLowerCase() === 'granted')
    .map((permission) => normalizeOptionalString(permission.permission))
    .filter((permission): permission is string => Boolean(permission));

  return {
    pages,
    adAccounts,
    permissions,
    pageAccessTokens,
  };
}

function mapMetaAdsIntegration(row: Record<string, unknown> | null): MetaAdsIntegrationConfig | null {
  if (!row) {
    return null;
  }

  return {
    userId: String(row.user_id),
    status: (normalizeOptionalString(row.status) as MetaAdsIntegrationConfig['status']) || 'draft',
    pageId: normalizeOptionalIdentifier(row.page_id),
    pageName: normalizeOptionalString(row.page_name),
    pagePictureUrl: normalizeOptionalString(row.page_picture_url),
    pageAccessTokenLast4: normalizeOptionalString(row.page_access_token_last4),
    adAccountId: normalizeMetaAdAccountId(row.ad_account_id),
    adAccountName: normalizeOptionalString(row.ad_account_name),
    adAccountStatus: normalizeMetaAdAccountStatus(row.ad_account_status),
    currency: normalizeOptionalString(row.currency),
    timezoneName: normalizeOptionalString(row.timezone_name),
    accessTokenLast4: normalizeOptionalString(row.access_token_last4),
    permissions: normalizeStringArray(row.permissions),
    connectedAt: normalizeOptionalString(row.connected_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    lastError: normalizeOptionalString(row.last_error),
    metadata: isRecord(row.metadata) ? (row.metadata as Record<string, unknown>) : {},
  };
}

function getMetaAdsSelectedAssets(config: MetaAdsIntegrationConfig | null) {
  return {
    pages: config?.pageId
      ? [
          {
            pageId: config.pageId,
            pageName: config.pageName,
            pagePictureUrl: config.pagePictureUrl,
            pageTasks: [],
            hasPageAccessToken: Boolean(config.pageAccessTokenLast4),
          } satisfies MetaAdsPageOption,
        ]
      : [],
    adAccounts: config?.adAccountId
      ? [
          {
            adAccountId: config.adAccountId,
            accountId: getRawMetaAdAccountNumber(config.adAccountId),
            name: config.adAccountName,
            accountStatus: config.adAccountStatus,
            currency: config.currency,
            timezoneName: config.timezoneName,
            businessId: null,
            businessName: null,
          } satisfies MetaAdsAdAccountOption,
        ]
      : [],
  };
}

async function getMetaAdsIntegrationSetup(
  userId: string,
  options: { includeLiveAssets?: boolean } = {},
): Promise<MetaAdsIntegrationSetupResponse> {
  const result = await adminSupabase
    .from('meta_ads_integrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return { config: null, pages: [], adAccounts: [] };
    }

    throw result.error;
  }

  const config = mapMetaAdsIntegration(result.data as Record<string, unknown> | null);
  const selectedAssets = getMetaAdsSelectedAssets(config);

  if (!options.includeLiveAssets || !result.data?.access_token_ciphertext) {
    return {
      config,
      pages: selectedAssets.pages,
      adAccounts: selectedAssets.adAccounts,
    };
  }

  try {
    const accessToken = decryptAccessToken(String(result.data.access_token_ciphertext));
    const assets = await fetchMetaAdsAssets(accessToken);

    return {
      config,
      pages: assets.pages.length ? assets.pages : selectedAssets.pages,
      adAccounts: assets.adAccounts.length ? assets.adAccounts : selectedAssets.adAccounts,
    };
  } catch {
    return {
      config,
      pages: selectedAssets.pages,
      adAccounts: selectedAssets.adAccounts,
    };
  }
}

async function saveMetaAdsIntegration(userId: string, input: MetaAdsIntegrationSaveInput) {
  assertMetaOAuthFlowState(input.flowState, 'ads_flow');
  const selectedPageId = normalizeOptionalIdentifier(input.pageId);
  const selectedAdAccountId = normalizeMetaAdAccountId(input.adAccountId);

  if (!selectedPageId || !selectedAdAccountId) {
    throw new Error('Select a Facebook Page and Ads Manager account before saving.');
  }

  const existingResult = await adminSupabase
    .from('meta_ads_integrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingResult.error && !isMissingSchemaError(existingResult.error)) {
    throw existingResult.error;
  }

  const providedToken = normalizeOptionalString(input.accessToken);
  const storedTokenCiphertext = normalizeOptionalString(existingResult.data?.access_token_ciphertext);
  const accessToken =
    providedToken || (storedTokenCiphertext ? decryptAccessToken(storedTokenCiphertext) : null);

  if (!accessToken) {
    throw new Error('Connect with Facebook before saving the Ads integration.');
  }

  const assets = await fetchMetaAdsAssets(accessToken);
  const selectedPage = assets.pages.find((page) => page.pageId === selectedPageId);
  const selectedAdAccount = assets.adAccounts.find((account) =>
    isSameMetaAdAccountId(account, selectedAdAccountId),
  );

  if (!selectedPage) {
    throw new Error('The selected Facebook Page was not returned by Meta for this login.');
  }

  if (!selectedAdAccount) {
    throw new Error('The selected Ads Manager account was not returned by Meta for this login.');
  }

  const pageAccessToken = assets.pageAccessTokens.get(selectedPage.pageId) || null;
  const timestamp = new Date().toISOString();
  const payload = {
    user_id: userId,
    status: 'ready',
    page_id: selectedPage.pageId,
    page_name: selectedPage.pageName,
    page_picture_url: selectedPage.pagePictureUrl,
    page_access_token_ciphertext: pageAccessToken ? encryptAccessToken(pageAccessToken) : null,
    page_access_token_last4: pageAccessToken ? last4(pageAccessToken) : null,
    ad_account_id: selectedAdAccount.adAccountId,
    ad_account_name: selectedAdAccount.name,
    ad_account_status: selectedAdAccount.accountStatus,
    currency: selectedAdAccount.currency,
    timezone_name: selectedAdAccount.timezoneName,
    access_token_ciphertext: encryptAccessToken(accessToken),
    access_token_last4: last4(accessToken),
    permissions: assets.permissions,
    metadata: {
      source: 'facebook_login',
      flowState: normalizeMetaOAuthFlowState(input.flowState) || 'ads_flow',
      oauthState: normalizeOptionalString(input.oauthState),
      selectedBusinessId: selectedAdAccount.businessId,
      selectedBusinessName: selectedAdAccount.businessName,
      availablePageCount: assets.pages.length,
      availableAdAccountCount: assets.adAccounts.length,
      savedAt: timestamp,
    },
    last_error: null,
    connected_at: timestamp,
    last_synced_at: timestamp,
  };

  const { error } = await adminSupabase
    .from('meta_ads_integrations')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }

  return getMetaAdsIntegrationSetup(userId, { includeLiveAssets: true });
}

async function disconnectMetaAdsIntegration(userId: string) {
  const { error } = await adminSupabase
    .from('meta_ads_integrations')
    .delete()
    .eq('user_id', userId);

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return { config: null, pages: [], adAccounts: [] } satisfies MetaAdsIntegrationSetupResponse;
}

async function fetchMetaAdsLeadForms(pageAccessToken: string, pageId: string) {
  const response = await metaRequestDetailed<{
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      locale?: string;
      created_time?: string;
      follow_up_action_url?: string;
      questions?: unknown[];
    }>;
  }>({
    accessToken: pageAccessToken,
    path: `${pageId}/leadgen_forms`,
    query: {
      fields: 'id,name,status,locale,created_time,follow_up_action_url,questions',
    },
  });

  return (response.data || [])
    .map((form) => {
      const formId = normalizeOptionalIdentifier(form.id);

      if (!formId) {
        return null;
      }

      const questions = Array.isArray(form.questions)
        ? form.questions
            .map((question) => {
              if (!isRecord(question)) {
                return null;
              }

              return (
                normalizeOptionalString(question.label) ||
                normalizeOptionalString(question.key) ||
                normalizeOptionalString(question.type)
              );
            })
            .filter((entry): entry is string => Boolean(entry))
        : [];

      return {
        formId,
        pageId,
        name: normalizeOptionalString(form.name),
        status: normalizeOptionalString(form.status),
        locale: normalizeOptionalString(form.locale),
        createdTime: normalizeOptionalString(form.created_time),
        followUpActionUrl: normalizeOptionalString(form.follow_up_action_url),
        questions,
      } satisfies MetaAdsLeadFormOption;
    })
    .filter(Boolean) as MetaAdsLeadFormOption[];
}

async function fetchMetaAdsPixels(accessToken: string, adAccountId: string) {
  const response = await metaRequestDetailed<{
    data?: Array<{
      id?: string;
      name?: string;
      created_time?: string;
      last_fired_time?: string;
    }>;
  }>({
    accessToken,
    path: `${adAccountId}/adspixels`,
    query: {
      fields: 'id,name,created_time,last_fired_time',
    },
  });

  return (response.data || [])
    .map((pixel) => {
      const pixelId = normalizeOptionalIdentifier(pixel.id);

      if (!pixelId) {
        return null;
      }

      return {
        pixelId,
        adAccountId,
        name: normalizeOptionalString(pixel.name),
        createdTime: normalizeOptionalString(pixel.created_time),
        lastFiredTime: normalizeOptionalString(pixel.last_fired_time),
      } satisfies MetaAdsPixelOption;
    })
    .filter(Boolean) as MetaAdsPixelOption[];
}

async function fetchMetaAdsWhatsAppAccounts(userId: string) {
  const result = await adminSupabase
    .from('meta_channels')
    .select(
      'id,waba_id,phone_number_id,display_phone_number,verified_name,quality_rating,business_account_name,status,last_synced_at',
    )
    .eq('user_id', userId);

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return [] as MetaAdsWhatsAppAccountOption[];
    }

    throw result.error;
  }

  const deduped = new Map<string, MetaAdsWhatsAppAccountOption>();

  for (const row of (result.data || []) as Record<string, unknown>[]) {
    const channelId = normalizeOptionalIdentifier(row.id);
    const wabaId = normalizeOptionalIdentifier(row.waba_id);
    const phoneNumberId = normalizeOptionalIdentifier(row.phone_number_id);

    if (!channelId || !wabaId || !phoneNumberId) {
      continue;
    }

    deduped.set(phoneNumberId, {
      channelId,
      wabaId,
      phoneNumberId,
      businessAccountName: normalizeOptionalString(row.business_account_name),
      displayPhoneNumber: normalizeOptionalString(row.display_phone_number),
      verifiedName: normalizeOptionalString(row.verified_name),
      qualityRating: normalizeOptionalString(row.quality_rating),
      status: (normalizeOptionalString(row.status) as MetaAdsWhatsAppAccountOption['status']) || null,
      lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    });
  }

  return Array.from(deduped.values());
}

async function getMetaAdsCreationSetup(userId: string): Promise<MetaAdsCreationSetupResponse> {
  const [setup, whatsAppAccounts] = await Promise.all([
    getMetaAdsIntegrationSetup(userId, { includeLiveAssets: true }),
    fetchMetaAdsWhatsAppAccounts(userId).catch(() => []),
  ]);

  const baseResponse = {
    config: setup.config,
    pages: setup.pages,
    adAccounts: setup.adAccounts,
    leadForms: [],
    pixels: [],
    whatsAppAccounts,
  } satisfies MetaAdsCreationSetupResponse;

  if (!setup.config?.pageId || !setup.config?.adAccountId || setup.config.status !== 'ready') {
    return baseResponse;
  }

  try {
    const { row, config, accessToken } = await getStoredMetaAdsIntegrationWithToken(userId);
    const pageAccessTokenCiphertext = normalizeOptionalString(row.page_access_token_ciphertext);
    const pageAccessToken = pageAccessTokenCiphertext ? decryptAccessToken(pageAccessTokenCiphertext) : accessToken;

    const [leadForms, pixels] = await Promise.all([
      fetchMetaAdsLeadForms(pageAccessToken, config.pageId || setup.config.pageId).catch(() => []),
      fetchMetaAdsPixels(accessToken, config.adAccountId || setup.config.adAccountId).catch(() => []),
    ]);

    return {
      ...baseResponse,
      leadForms,
      pixels,
    };
  } catch {
    return baseResponse;
  }
}

function normalizeMetaAdsCampaignPeriod(value: unknown): MetaAdsCampaignPeriod {
  const normalized = normalizeOptionalString(value);

  if (
    normalized === 'last_7d' ||
    normalized === 'last_30d' ||
    normalized === 'this_month' ||
    normalized === 'last_month' ||
    normalized === 'maximum' ||
    normalized === 'custom'
  ) {
    return normalized;
  }

  return 'last_30d';
}

function normalizeMetaAdsDate(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : normalized;
}

function parseMetaNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function parseMetaBudgetAmount(value: unknown) {
  const numeric = parseMetaNumber(value);
  return numeric === null ? null : numeric / 100;
}

function normalizeMetaStatus(value: unknown) {
  return normalizeOptionalString(value)?.toUpperCase() || null;
}

function titleCaseMetaValue(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getMetaActionLabel(actionType: string) {
  const normalized = actionType.toLowerCase();

  if (normalized.includes('messaging_conversation')) return 'Messaging conversations';
  if (normalized.includes('lead')) return 'Leads';
  if (normalized.includes('purchase')) return 'Purchases';
  if (normalized.includes('landing_page_view')) return 'Landing page views';
  if (normalized.includes('link_click')) return 'Link clicks';
  if (normalized.includes('post_engagement')) return 'Post engagements';
  if (normalized.includes('onsite_conversion')) return 'Conversions';

  return titleCaseMetaValue(actionType);
}

function getMetaAdsResult(insights: Record<string, unknown> | null): MetaAdsManagedCampaign['results'] {
  const actions = Array.isArray(insights?.actions) ? insights.actions : [];
  const normalizedActions = actions
    .map((action) => {
      if (!isRecord(action)) {
        return null;
      }

      const actionType = normalizeOptionalString(action.action_type);
      const value = parseMetaNumber(action.value);

      return actionType && value !== null
        ? {
            actionType,
            label: getMetaActionLabel(actionType),
            value,
          }
        : null;
    })
    .filter((action): action is NonNullable<typeof action> => Boolean(action));

  const priority = [
    'messaging_conversation',
    'lead',
    'purchase',
    'landing_page_view',
    'link_click',
    'post_engagement',
    'onsite_conversion',
  ];

  for (const key of priority) {
    const match = normalizedActions.find((action) => action.actionType.toLowerCase().includes(key));
    if (match) {
      return match;
    }
  }

  if (normalizedActions[0]) {
    return normalizedActions[0];
  }

  const clicks = parseMetaNumber(insights?.clicks);
  if (clicks !== null) {
    return { actionType: 'clicks', label: 'Clicks', value: clicks };
  }

  return null;
}

function findMetaCreativeText(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeOptionalString(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findMetaCreativeText(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['message', 'name', 'title', 'body', 'description', 'link']) {
    const found = normalizeOptionalString(value[key]);
    if (found) {
      return found;
    }
  }

  for (const entry of Object.values(value)) {
    const found = findMetaCreativeText(entry);
    if (found) {
      return found;
    }
  }

  return null;
}

function findMetaCreativeImageUrl(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['thumbnail_url', 'image_url', 'picture', 'url']) {
    const found = normalizeOptionalString(value[key]);
    if (found?.startsWith('http')) {
      return found;
    }
  }

  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const found = findMetaCreativeImageUrl(item);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findMetaCreativeImageUrl(entry);
    if (found) {
      return found;
    }
  }

  return null;
}

function mapMetaManagedAd(rawAd: Record<string, unknown>): MetaAdsManagedAd {
  const adset = isRecord(rawAd.adset) ? rawAd.adset : null;
  const creative = isRecord(rawAd.creative) ? rawAd.creative : null;
  const objectStorySpec = creative?.object_story_spec;

  return {
    id: String(rawAd.id),
    name: normalizeOptionalString(rawAd.name),
    status: normalizeMetaStatus(rawAd.status),
    effectiveStatus: normalizeMetaStatus(rawAd.effective_status),
    adsetId: normalizeOptionalIdentifier(adset?.id),
    adsetName: normalizeOptionalString(adset?.name),
    creativeId: normalizeOptionalIdentifier(creative?.id),
    creativeName: normalizeOptionalString(creative?.name),
    thumbnailUrl: normalizeOptionalString(creative?.thumbnail_url) || findMetaCreativeImageUrl(objectStorySpec),
    previewText: findMetaCreativeText(objectStorySpec),
    raw: rawAd,
  };
}

function getMetaAdsCampaignBudget(
  campaign: Record<string, unknown>,
  ads: MetaAdsManagedAd[],
): Pick<MetaAdsManagedCampaign, 'budgetAllocated' | 'budgetAllocatedType'> {
  const dailyBudget = parseMetaBudgetAmount(campaign.daily_budget);
  if (dailyBudget !== null) {
    return { budgetAllocated: dailyBudget, budgetAllocatedType: 'daily' };
  }

  const lifetimeBudget = parseMetaBudgetAmount(campaign.lifetime_budget);
  if (lifetimeBudget !== null) {
    return { budgetAllocated: lifetimeBudget, budgetAllocatedType: 'lifetime' };
  }

  const spendCap = parseMetaBudgetAmount(campaign.spend_cap);
  if (spendCap !== null) {
    return { budgetAllocated: spendCap, budgetAllocatedType: 'spend_cap' };
  }

  const adsetBudgets = new Map<string, number>();

  for (const ad of ads) {
    const adset = isRecord(ad.raw.adset) ? ad.raw.adset : null;
    const adsetId = ad.adsetId || ad.id;
    const adsetBudget =
      parseMetaBudgetAmount(adset?.daily_budget) ?? parseMetaBudgetAmount(adset?.lifetime_budget);

    if (adsetBudget !== null && !adsetBudgets.has(adsetId)) {
      adsetBudgets.set(adsetId, adsetBudget);
    }
  }

  const totalAdsetBudget = Array.from(adsetBudgets.values()).reduce((sum, value) => sum + value, 0);
  return totalAdsetBudget > 0
    ? { budgetAllocated: totalAdsetBudget, budgetAllocatedType: 'adset' }
    : { budgetAllocated: null, budgetAllocatedType: null };
}

function getMetaAdsInsightsQuery(period: MetaAdsCampaignPeriod, since: string | null, until: string | null) {
  const query: Record<string, string | number | boolean | undefined> = {
    fields: 'spend,impressions,clicks,reach,actions',
    limit: 1,
  };

  if (period === 'custom' && since && until) {
    query.time_range = JSON.stringify({ since, until });
  } else {
    query.date_preset = period === 'custom' ? 'last_30d' : period;
  }

  return query;
}

async function getStoredMetaAdsIntegrationWithToken(userId: string) {
  const result = await adminSupabase
    .from('meta_ads_integrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      throw new Error('Apply the Meta Ads integration schema before opening Meta Ads Manager.');
    }

    throw result.error;
  }

  const row = result.data as Record<string, unknown> | null;
  const config = mapMetaAdsIntegration(row);
  const tokenCiphertext = normalizeOptionalString(row?.access_token_ciphertext);

  if (!row || !config || config.status !== 'ready' || !config.adAccountId || !tokenCiphertext) {
    throw new Error('Connect Create Meta Ad from Integrations before opening Meta Ads Manager.');
  }

  return {
    row,
    config,
    accessToken: decryptAccessToken(tokenCiphertext),
  };
}

async function fetchMetaAdsCampaignRows(accessToken: string, adAccountId: string) {
  const campaigns: Record<string, unknown>[] = [];
  let after: string | undefined;

  do {
    const response = await metaRequestDetailed<{
      data?: Record<string, unknown>[];
      paging?: {
        next?: string;
        cursors?: {
          after?: string;
        };
      };
    }>({
      accessToken,
      path: `${adAccountId}/campaigns`,
      query: {
        fields:
          'id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,spend_cap,start_time,stop_time,created_time,updated_time,buying_type',
        limit: 100,
        after,
      },
    });

    campaigns.push(...(response.data || []).filter(isRecord));
    after = normalizeOptionalString(response.paging?.cursors?.after) || undefined;

    if (!response.paging?.next || campaigns.length >= 500) {
      break;
    }
  } while (after);

  return campaigns;
}

function mapMetaAdsMediaAsset(rawAsset: Record<string, unknown>): MetaAdsMediaAsset | null {
  const id = normalizeOptionalIdentifier(rawAsset.id || rawAsset.hash);

  if (!id) {
    return null;
  }

  return {
    id,
    name: normalizeOptionalString(rawAsset.name),
    hash: normalizeOptionalString(rawAsset.hash),
    url: normalizeOptionalString(rawAsset.url) || normalizeOptionalString(rawAsset.permalink_url),
    thumbnailUrl:
      normalizeOptionalString(rawAsset.url_128) ||
      normalizeOptionalString(rawAsset.url) ||
      normalizeOptionalString(rawAsset.permalink_url),
    width: parseMetaNumber(rawAsset.width) || parseMetaNumber(rawAsset.original_width),
    height: parseMetaNumber(rawAsset.height) || parseMetaNumber(rawAsset.original_height),
    createdTime: normalizeOptionalString(rawAsset.created_time),
    source: 'meta',
    raw: rawAsset,
  } satisfies MetaAdsMediaAsset;
}

async function fetchMetaAdsMediaLibrary(userId: string): Promise<MetaAdsMediaLibraryResponse> {
  const { config, accessToken } = await getStoredMetaAdsIntegrationWithToken(userId);
  const adAccountId = config.adAccountId;

  if (!adAccountId) {
    throw new Error('Select an ad account in Integrations before opening the media gallery.');
  }

  const assets: MetaAdsMediaAsset[] = [];
  let after: string | undefined;

  do {
    const response = await metaRequestDetailed<{
      data?: Record<string, unknown>[];
      paging?: {
        next?: string;
        cursors?: {
          after?: string;
        };
      };
    }>({
      accessToken,
      path: `${adAccountId}/adimages`,
      query: {
        fields: 'id,name,hash,url,url_128,permalink_url,width,height,original_width,original_height,created_time',
        limit: 100,
        after,
      },
    });

    assets.push(
      ...(response.data || [])
        .filter(isRecord)
        .map(mapMetaAdsMediaAsset)
        .filter((asset): asset is MetaAdsMediaAsset => Boolean(asset)),
    );
    after = normalizeOptionalString(response.paging?.cursors?.after) || undefined;

    if (!response.paging?.next || assets.length >= 300) {
      break;
    }
  } while (after);

  return {
    config,
    assets,
  } satisfies MetaAdsMediaLibraryResponse;
}

async function fetchMetaAdsCampaignAds(accessToken: string, campaignId: string) {
  const ads: Record<string, unknown>[] = [];
  let after: string | undefined;

  do {
    const response = await metaRequestDetailed<{
      data?: Record<string, unknown>[];
      paging?: {
        next?: string;
        cursors?: {
          after?: string;
        };
      };
    }>({
      accessToken,
      path: `${campaignId}/ads`,
      query: {
        fields:
          'id,name,status,effective_status,created_time,updated_time,adset{id,name,daily_budget,lifetime_budget,budget_remaining},creative{id,name,thumbnail_url,object_story_spec}',
        limit: 100,
        after,
      },
    });

    ads.push(...(response.data || []).filter(isRecord));
    after = normalizeOptionalString(response.paging?.cursors?.after) || undefined;

    if (!response.paging?.next || ads.length >= 300) {
      break;
    }
  } while (after);

  return ads;
}

async function fetchMetaAdsCampaignInsight(
  accessToken: string,
  campaignId: string,
  period: MetaAdsCampaignPeriod,
  since: string | null,
  until: string | null,
) {
  const response = await metaRequestDetailed<{
    data?: Record<string, unknown>[];
  }>({
    accessToken,
    path: `${campaignId}/insights`,
    query: getMetaAdsInsightsQuery(period, since, until),
  });

  return (response.data || []).find(isRecord) || null;
}

async function fetchMetaAdsCampaigns(
  userId: string,
  query: { period?: unknown; since?: unknown; until?: unknown },
): Promise<MetaAdsCampaignsResponse> {
  const { config, accessToken } = await getStoredMetaAdsIntegrationWithToken(userId);
  const adAccountId = config.adAccountId;

  if (!adAccountId) {
    throw new Error('Select an ad account in Integrations before opening Meta Ads Manager.');
  }

  const period = normalizeMetaAdsCampaignPeriod(query.period);
  const since = normalizeMetaAdsDate(query.since);
  const until = normalizeMetaAdsDate(query.until);
  const campaignRows = await fetchMetaAdsCampaignRows(accessToken, adAccountId);
  const campaigns = await Promise.all(
    campaignRows.map(async (campaign) => {
      const campaignId = normalizeOptionalIdentifier(campaign.id);

      if (!campaignId) {
        return null;
      }

      const [insights, adRows] = await Promise.all([
        fetchMetaAdsCampaignInsight(accessToken, campaignId, period, since, until).catch(() => null),
        fetchMetaAdsCampaignAds(accessToken, campaignId).catch(() => []),
      ]);
      const ads = adRows.map(mapMetaManagedAd);
      const budget = getMetaAdsCampaignBudget(campaign, ads);

      return {
        id: campaignId,
        name: normalizeOptionalString(campaign.name),
        objective: normalizeOptionalString(campaign.objective),
        status: normalizeMetaStatus(campaign.status),
        effectiveStatus: normalizeMetaStatus(campaign.effective_status),
        deliveryStatus: normalizeMetaStatus(campaign.effective_status) || normalizeMetaStatus(campaign.status),
        results: getMetaAdsResult(insights),
        impressions: parseMetaNumber(insights?.impressions),
        reach: parseMetaNumber(insights?.reach),
        clicks: parseMetaNumber(insights?.clicks),
        ...budget,
        budgetSpent: parseMetaNumber(insights?.spend),
        currency: config.currency,
        startTime: normalizeOptionalString(campaign.start_time),
        stopTime: normalizeOptionalString(campaign.stop_time),
        createdTime: normalizeOptionalString(campaign.created_time),
        updatedTime: normalizeOptionalString(campaign.updated_time),
        ads,
        raw: campaign,
        insightsRaw: insights,
      } satisfies MetaAdsManagedCampaign;
    }),
  );

  return {
    config,
    campaigns: campaigns.filter((campaign): campaign is MetaAdsManagedCampaign => Boolean(campaign)),
    period,
    since,
    until,
  } satisfies MetaAdsCampaignsResponse;
}

function normalizeMetaAdsCampaignStatusInput(value: unknown): MetaAdsCampaignStatusUpdateInput['status'] {
  const normalized = normalizeMetaStatus(value);

  if (normalized === 'ACTIVE' || normalized === 'PAUSED') {
    return normalized;
  }

  throw new Error('Campaign status must be ACTIVE or PAUSED.');
}

async function updateMetaAdsCampaignStatus(
  userId: string,
  campaignId: string,
  input: MetaAdsCampaignStatusUpdateInput,
): Promise<MetaAdsCampaignStatusUpdateResponse> {
  const normalizedCampaignId = normalizeOptionalIdentifier(campaignId);
  if (!normalizedCampaignId) {
    throw new Error('Campaign ID is required.');
  }

  const { accessToken } = await getStoredMetaAdsIntegrationWithToken(userId);
  const status = normalizeMetaAdsCampaignStatusInput(input.status);

  await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: normalizedCampaignId,
    method: 'POST',
    body: { status },
  });

  const refreshed = await metaRequestDetailed<{
    id?: string;
    status?: string;
    effective_status?: string;
  }>({
    accessToken,
    path: normalizedCampaignId,
    query: {
      fields: 'id,status,effective_status',
    },
  });

  return {
    campaignId: normalizeOptionalIdentifier(refreshed.id) || normalizedCampaignId,
    status: normalizeMetaStatus(refreshed.status) || status,
    effectiveStatus: normalizeMetaStatus(refreshed.effective_status),
  } satisfies MetaAdsCampaignStatusUpdateResponse;
}

async function fetchMessengerPage(accessToken: string, pageId: string) {
  return metaRequestDetailed<{
    id?: string;
    name?: string;
    picture?: unknown;
  }>({
    accessToken,
    path: pageId,
    query: {
      fields: 'id,name,picture{url}',
    },
  });
}

async function listWhatsAppSubscribedApps(accessToken: string, wabaId: string) {
  return metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${wabaId}/subscribed_apps`,
  });
}

async function unsubscribeWhatsAppWebhookApp(accessToken: string, wabaId: string) {
  return metaRequestDetailed<{
    success?: boolean;
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${wabaId}/subscribed_apps`,
    method: 'DELETE',
  });
}

async function subscribeWhatsAppWebhookApp(args: {
  accessToken: string;
  wabaId: string;
  callbackUrl: string;
  verifyToken: string;
}) {
  await metaRequestDetailed<{ success?: boolean }>({
    accessToken: args.accessToken,
    path: `${args.wabaId}/subscribed_apps`,
    method: 'POST',
    body: {},
  });

  await metaRequestDetailed<{ success?: boolean }>({
    accessToken: args.accessToken,
    path: `${args.wabaId}/subscribed_apps`,
    method: 'POST',
    body: {
      override_callback_uri: args.callbackUrl,
      verify_token: args.verifyToken,
    },
  });
}

function getWhatsAppSubscribedAppData(entry: Record<string, unknown>) {
  const nestedApiData = isRecord(entry.whatsapp_business_api_data)
    ? (entry.whatsapp_business_api_data as Record<string, unknown>)
    : null;

  return nestedApiData || entry;
}

function getMetaChannelMetadata(row: Record<string, unknown>) {
  return isRecord(row.metadata) ? (row.metadata as Record<string, unknown>) : {};
}

function getNormalizedIdentifierList(value: unknown) {
  const entries = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      entries
        .map((entry) => normalizeOptionalIdentifier(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function hasSharedIdentifiers(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function getCatalogWebhookMetadata(metadata: Record<string, unknown>) {
  return isRecord(metadata.catalogWebhook)
    ? (metadata.catalogWebhook as Record<string, unknown>)
    : {};
}

function getCatalogConnectionMetadata(metadata: Record<string, unknown>) {
  return isRecord(metadata.catalogConnection)
    ? (metadata.catalogConnection as Record<string, unknown>)
    : {};
}

function buildMetaCatalogWebhookSetupResponse(
  req: Request,
  row: Record<string, unknown> | null,
): MetaCatalogWebhookSetupResponse {
  const metadata = row ? getMetaChannelMetadata(row) : {};
  const catalogWebhook = getCatalogWebhookMetadata(metadata);
  const reusableMetaSetup = isRecord(metadata.reusableMetaSetup)
    ? (metadata.reusableMetaSetup as Record<string, unknown>)
    : {};
  const reusableIdentifiers = isRecord(reusableMetaSetup.identifiers)
    ? (reusableMetaSetup.identifiers as Record<string, unknown>)
    : {};

  return {
    hasChannel: Boolean(row),
    callbackUrl: getMetaCatalogWebhookCallbackUrl(req),
    verifyToken: metaWebhookVerifyToken,
    connectedWabaId: row ? normalizeOptionalIdentifier(row.waba_id) : null,
    connectedPhoneNumberId: row ? normalizeOptionalIdentifier(row.phone_number_id) : null,
    businessAccountName: row ? normalizeOptionalString(row.business_account_name) : null,
    discoveredCatalogIds: getNormalizedIdentifierList(reusableIdentifiers.catalogIds),
    lastWebhookAt: normalizeOptionalString(catalogWebhook.lastWebhookAt),
    lastMatchedAt: normalizeOptionalString(catalogWebhook.lastMatchedAt),
    lastWebhookObject: normalizeOptionalString(catalogWebhook.lastWebhookObject),
    lastCatalogIds: getNormalizedIdentifierList(catalogWebhook.lastCatalogIds),
    lastError: normalizeOptionalString(catalogWebhook.lastError),
  };
}

function getMetaCatalogSelectionMetadata(metadata: Record<string, unknown>) {
  return isRecord(metadata.catalogSelection)
    ? (metadata.catalogSelection as Record<string, unknown>)
    : {};
}

function getMetaCatalogConnectionContext(row: Record<string, unknown>) {
  const metadata = getMetaChannelMetadata(row);
  const reusableMetaSetup = isRecord(metadata.reusableMetaSetup)
    ? (metadata.reusableMetaSetup as Record<string, unknown>)
    : {};
  const reusableIdentifiers = isRecord(reusableMetaSetup.identifiers)
    ? (reusableMetaSetup.identifiers as Record<string, unknown>)
    : {};
  const catalogWebhook = getCatalogWebhookMetadata(metadata);
  const businessIds = getNormalizedIdentifierList(reusableIdentifiers.businessIds);
  const embeddedCatalogIds = getNormalizedIdentifierList(reusableIdentifiers.catalogIds);
  const webhookCatalogIds = getNormalizedIdentifierList(catalogWebhook.lastCatalogIds);
  const catalogConnection = getCatalogConnectionMetadata(metadata);
  const connectedBusinessIds = getNormalizedIdentifierList(catalogConnection.businessIds);
  const connectedCatalogIds = getNormalizedIdentifierList(catalogConnection.catalogIds);
  const catalogSelection = getMetaCatalogSelectionMetadata(metadata);

  return {
    metadata,
    businessIds: Array.from(new Set([...businessIds, ...connectedBusinessIds])),
    catalogIds: Array.from(new Set([...embeddedCatalogIds, ...webhookCatalogIds, ...connectedCatalogIds])),
    selectedCatalogId: normalizeOptionalIdentifier(catalogSelection.selectedCatalogId),
  };
}

function resolveMetaCatalogAccessToken(row: Record<string, unknown>, fallbackAccessToken: string) {
  const metadata = getMetaChannelMetadata(row);
  const catalogConnection = getCatalogConnectionMetadata(metadata);
  const tokenCiphertext = normalizeOptionalString(catalogConnection.accessTokenCiphertext);

  if (tokenCiphertext) {
    try {
      return decryptAccessToken(tokenCiphertext);
    } catch (error) {
      console.error('Failed to decrypt Meta Catalog access token:', error);
    }
  }

  return fallbackAccessToken;
}

function parseMetaOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMetaCatalogSummary(record: Record<string, unknown>): MetaCatalogSummary | null {
  const id = normalizeOptionalIdentifier(record.id);

  if (!id) {
    return null;
  }

  const business = isRecord(record.business) ? (record.business as Record<string, unknown>) : {};

  return {
    id,
    name: normalizeOptionalString(record.name),
    vertical: normalizeOptionalString(record.vertical),
    productCount: parseMetaOptionalNumber(record.product_count),
    feedCount: parseMetaOptionalNumber(record.feed_count),
    businessId: normalizeOptionalIdentifier(business.id),
    businessName: normalizeOptionalString(business.name),
    defaultImageUrl: normalizeOptionalString(record.default_image_url),
    isCatalogSegment: Boolean(record.is_catalog_segment),
    isLocalCatalog: Boolean(record.is_local_catalog),
  };
}

async function fetchMetaCatalog(accessToken: string, catalogId: string) {
  const response = await metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: catalogId,
    query: {
      fields:
        'id,name,vertical,product_count,feed_count,default_image_url,is_catalog_segment,is_local_catalog,business{id,name}',
    },
  });

  const catalog = mapMetaCatalogSummary(response);

  if (!catalog) {
    throw new Error('Meta did not return a valid catalog record.');
  }

  return catalog;
}

async function listOwnedMetaCatalogs(accessToken: string, businessId: string) {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${businessId}/owned_product_catalogs`,
    query: {
      fields:
        'id,name,vertical,product_count,feed_count,default_image_url,is_catalog_segment,is_local_catalog,business{id,name}',
      limit: 200,
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((entry) => mapMetaCatalogSummary(entry))
        .filter((entry): entry is MetaCatalogSummary => Boolean(entry))
    : [];
}

async function listMetaBusinessesForCatalogConnection(accessToken: string) {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: 'me/businesses',
    query: {
      fields: 'id,name',
      limit: 200,
    },
  });

  return Array.isArray(response.data)
    ? response.data
        .map((entry) => normalizeOptionalIdentifier(entry.id))
        .filter((entry): entry is string => Boolean(entry))
    : [];
}

async function saveMetaCatalogConnection(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  flowState: string | null;
  oauthState: string | null;
}) {
  const businessIds = await listMetaBusinessesForCatalogConnection(args.accessToken);
  const catalogMap = new Map<string, MetaCatalogSummary>();

  for (const businessId of businessIds) {
    const catalogs = await listOwnedMetaCatalogs(args.accessToken, businessId);
    for (const catalog of catalogs) {
      catalogMap.set(catalog.id, catalog);
    }
  }

  const metadata = getMetaChannelMetadata(args.row);
  const currentCatalogConnection = getCatalogConnectionMetadata(metadata);
  const updatedAt = new Date().toISOString();
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...metadata,
        catalogConnection: {
          ...currentCatalogConnection,
          accessTokenCiphertext: encryptAccessToken(args.accessToken),
          accessTokenLast4: last4(args.accessToken),
          businessIds,
          catalogIds: Array.from(catalogMap.keys()),
          flowState: args.flowState,
          oauthState: args.oauthState,
          connectedAt: normalizeOptionalString(currentCatalogConnection.connectedAt) || updatedAt,
          updatedAt,
        },
      },
      updated_at: updatedAt,
    })
    .eq('user_id', args.userId)
    .eq('id', args.row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function listMetaCatalogsForChannel(
  row: Record<string, unknown>,
  accessToken: string,
): Promise<MetaCatalogListResponse> {
  const context = getMetaCatalogConnectionContext(row);
  const catalogMap = new Map<string, MetaCatalogSummary>();

  for (const businessId of context.businessIds) {
    try {
      const catalogs = await listOwnedMetaCatalogs(accessToken, businessId);
      for (const catalog of catalogs) {
        catalogMap.set(catalog.id, catalog);
      }
    } catch (error) {
      console.error(`Failed to list catalogs for Meta business ${businessId}:`, error);
    }
  }

  if (!catalogMap.size) {
    await Promise.all(
      context.catalogIds.map(async (catalogId) => {
        try {
          const catalog = await fetchMetaCatalog(accessToken, catalogId);
          catalogMap.set(catalog.id, catalog);
        } catch (error) {
          console.error(`Failed to fetch catalog ${catalogId}:`, error);
        }
      }),
    );
  }

  return {
    hasChannel: true,
    businessIds: context.businessIds,
    selectedCatalogId:
      context.selectedCatalogId && catalogMap.has(context.selectedCatalogId)
        ? context.selectedCatalogId
        : null,
    catalogs: Array.from(catalogMap.values()).sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id),
    ),
  };
}

async function saveMetaCatalogSelection(args: {
  userId: string;
  row: Record<string, unknown>;
  catalogId: string | null;
}) {
  const metadata = getMetaChannelMetadata(args.row);
  const currentSelection = getMetaCatalogSelectionMetadata(metadata);
  const updatedAt = new Date().toISOString();
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...metadata,
        catalogSelection: {
          ...currentSelection,
          selectedCatalogId: args.catalogId,
          selectedAt: args.catalogId ? updatedAt : null,
          clearedAt: args.catalogId ? null : updatedAt,
          updatedAt,
        },
      },
      updated_at: updatedAt,
    })
    .eq('user_id', args.userId)
    .eq('id', args.row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function createMetaCatalogForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  input: MetaCatalogCreateInput;
}) {
  const name = normalizeEditableString(args.input.name);
  if (!name) {
    throw new Error('A catalog name is required.');
  }

  const context = getMetaCatalogConnectionContext(args.row);
  const businessId = context.businessIds[0];

  if (!businessId) {
    throw new Error(
      'No Meta business ID is available for this workspace yet. Reconnect the channel through Embedded Signup so Connektly can discover your business catalogs.',
    );
  }

  const response = await metaRequestDetailed<{ id?: string }>({
    accessToken: args.accessToken,
    path: `${businessId}/owned_product_catalogs`,
    method: 'POST',
    body: {
      name,
      vertical: 'commerce',
    },
  });

  const catalogId = normalizeOptionalIdentifier(response.id);
  if (!catalogId) {
    throw new Error('Meta did not return a catalog ID after creation.');
  }

  const catalog = await fetchMetaCatalog(args.accessToken, catalogId);
  await saveMetaCatalogSelection({
    userId: args.userId,
    row: args.row,
    catalogId,
  });

  return {
    catalog,
    selectedCatalogId: catalogId,
  };
}

async function selectMetaCatalogForChannel(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  input: MetaCatalogSelectionInput;
}) {
  const catalogId = normalizeOptionalIdentifier(args.input.catalogId);

  if (!catalogId) {
    await saveMetaCatalogSelection({
      userId: args.userId,
      row: args.row,
      catalogId: null,
    });

    return {
      selectedCatalogId: null,
    };
  }

  const catalogs = await listMetaCatalogsForChannel(args.row, args.accessToken);
  if (!catalogs.catalogs.some((catalog) => catalog.id === catalogId)) {
    throw new Error('This catalog is not accessible with the connected Meta account.');
  }

  await saveMetaCatalogSelection({
    userId: args.userId,
    row: args.row,
    catalogId,
  });

  return {
    selectedCatalogId: catalogId,
  };
}

function mapMetaCatalogProduct(record: Record<string, unknown>) {
  const id = normalizeOptionalIdentifier(record.id);

  if (!id) {
    return null;
  }

  return {
    id,
    retailerId: normalizeOptionalString(record.retailer_id) || normalizeOptionalString(record.id),
    name: normalizeOptionalString(record.name),
    description: normalizeOptionalString(record.description),
    availability: normalizeOptionalString(record.availability),
    price: normalizeOptionalString(record.price),
    currency: normalizeOptionalString(record.currency),
    brand: normalizeOptionalString(record.brand),
    imageUrl:
      normalizeOptionalString(record.image_url) ||
      normalizeOptionalString(record.image_link),
    url: normalizeOptionalString(record.url) || normalizeOptionalString(record.link),
    raw: record,
  };
}

async function listMetaCatalogProducts(args: {
  row: Record<string, unknown>;
  accessToken: string;
  catalogId: string;
}): Promise<MetaCatalogProductsResponse> {
  const response = await metaRequestDetailed<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken: args.accessToken,
    path: `${args.catalogId}/products`,
    query: {
      fields: 'id,retailer_id,name,description,availability,price,currency,brand,image_url,url',
      limit: 200,
    },
  });

  const catalog = await fetchMetaCatalog(args.accessToken, args.catalogId);
  const context = getMetaCatalogConnectionContext(args.row);

  return {
    selectedCatalogId: context.selectedCatalogId,
    catalog,
    products: Array.isArray(response.data)
      ? response.data
          .map((entry) => mapMetaCatalogProduct(entry))
          .filter((entry): entry is MetaCatalogProductsResponse['products'][number] => Boolean(entry))
      : [],
  };
}

async function saveMetaCatalogItemsBatch(args: {
  row: Record<string, unknown>;
  accessToken: string;
  catalogId: string;
  input: MetaCatalogItemsBatchInput;
}) {
  const requests = Array.isArray(args.input.requests) ? args.input.requests : [];
  if (!requests.length) {
    throw new Error('At least one catalog item change is required.');
  }

  const normalizedRequests = requests.map((request) => {
    const method = normalizeOptionalString(request.method)?.toLowerCase();
    if (method !== 'create' && method !== 'update' && method !== 'delete') {
      throw new Error('Catalog item method must be create, update, or delete.');
    }

    const retailerId = normalizeEditableString(request.data?.id);
    if (!retailerId) {
      throw new Error('Each catalog item request must include an item ID.');
    }

    const data: Record<string, unknown> = {
      id: retailerId,
    };

    if (method !== 'delete') {
      const title = normalizeEditableString(request.data?.title);
      const description = normalizeEditableString(request.data?.description);
      const brand = normalizeEditableString(request.data?.brand);
      const price = normalizeEditableString(request.data?.price);
      const imageLink = normalizeEditableString(request.data?.image_link);
      const availability = normalizeEditableString(request.data?.availability);
      const link = normalizeEditableString(request.data?.link);

      if (title) {
        data.title = title;
      }

      if (description) {
        data.description = description;
      }

      if (brand) {
        data.brand = brand;
      }

      if (price) {
        data.price = price;
      }

      if (imageLink) {
        data.image_link = imageLink;
      }

      if (availability) {
        data.availability = availability;
      }

      if (link) {
        data.link = link;
      }
    }

    return {
      method,
      data,
    };
  });

  await metaRequestDetailed<Record<string, unknown>>({
    accessToken: args.accessToken,
    path: `${args.catalogId}/items_batch`,
    method: 'POST',
    body: {
      item_type: args.input.itemType || 'PRODUCT_ITEM',
      requests: normalizedRequests,
    },
  });

  return listMetaCatalogProducts(args);
}

async function findMetaChannelRowsForCatalogWebhookPayload(payload: unknown) {
  const identifiers = collectReusableMetaIdentifiers(payload);
  const hasAnyIdentifiers =
    identifiers.businessIds.length > 0 ||
    identifiers.wabaIds.length > 0 ||
    identifiers.phoneNumberIds.length > 0 ||
    identifiers.catalogIds.length > 0;

  if (!hasAnyIdentifiers) {
    return {
      identifiers,
      rows: [] as Record<string, unknown>[],
    };
  }

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .select('id,user_id,waba_id,phone_number_id,business_account_name,metadata');

  if (error) {
    throw error;
  }

  const rows = ((data as Record<string, unknown>[] | null) || []).filter((row) => {
    const metadata = getMetaChannelMetadata(row);
    const reusableMetaSetup = isRecord(metadata.reusableMetaSetup)
      ? (metadata.reusableMetaSetup as Record<string, unknown>)
      : {};
    const reusableIdentifiers = isRecord(reusableMetaSetup.identifiers)
      ? (reusableMetaSetup.identifiers as Record<string, unknown>)
      : {};

    const rowBusinessIds = getNormalizedIdentifierList(reusableIdentifiers.businessIds);
    const rowWabaIds = Array.from(
      new Set(
        [
          normalizeOptionalIdentifier(row.waba_id),
          ...getNormalizedIdentifierList(reusableIdentifiers.wabaIds),
        ].filter((entry): entry is string => Boolean(entry)),
      ),
    );
    const rowPhoneNumberIds = Array.from(
      new Set(
        [
          normalizeOptionalIdentifier(row.phone_number_id),
          ...getNormalizedIdentifierList(reusableIdentifiers.phoneNumberIds),
        ].filter((entry): entry is string => Boolean(entry)),
      ),
    );
    const rowCatalogIds = getNormalizedIdentifierList(reusableIdentifiers.catalogIds);

    return (
      hasSharedIdentifiers(identifiers.businessIds, rowBusinessIds) ||
      hasSharedIdentifiers(identifiers.wabaIds, rowWabaIds) ||
      hasSharedIdentifiers(identifiers.phoneNumberIds, rowPhoneNumberIds) ||
      hasSharedIdentifiers(identifiers.catalogIds, rowCatalogIds)
    );
  });

  return { identifiers, rows };
}

async function getMetaChannelRow(userId: string) {
  const { data, error } = await adminSupabase
    .from('meta_channels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data as Record<string, unknown> | null) || null;

  return row?.status === 'disconnected' ? null : row;
}

function resolveWhatsAppWebhookSubscriptionEntry(
  entries: Array<Record<string, unknown>>,
) {
  if (!entries.length) {
    return null;
  }

  if (metaAppId) {
    const exactMatch =
      entries.find((entry) => {
        const apiData = getWhatsAppSubscribedAppData(entry);
        return normalizeOptionalIdentifier(apiData?.id) === metaAppId;
      }) || null;

    if (exactMatch) {
      return exactMatch;
    }
  }

  return entries[0];
}

async function persistWhatsAppWebhookSubscriptionStatus(args: {
  userId: string;
  row: Record<string, unknown>;
  req: Request;
  entries: Array<Record<string, unknown>>;
  isSubscribed: boolean;
  lastError?: string | null;
}) {
  const callbackUrl = getMetaWebhookCallbackUrl(args.req);
  const existingMetadata = getMetaChannelMetadata(args.row);
  const existingSubscription = isRecord(existingMetadata.webhookSubscription)
    ? (existingMetadata.webhookSubscription as Record<string, unknown>)
    : {};
  const timestamp = new Date().toISOString();
  const matchedEntry = args.isSubscribed
    ? resolveWhatsAppWebhookSubscriptionEntry(args.entries)
    : null;
  const apiData = matchedEntry ? getWhatsAppSubscribedAppData(matchedEntry) : null;
  const overrideCallbackUri = normalizeOptionalString(matchedEntry?.override_callback_uri);

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      metadata: {
        ...existingMetadata,
        webhookSubscription: {
          isSubscribed: args.isSubscribed,
          callbackUrl,
          overrideCallbackUri: args.isSubscribed ? overrideCallbackUri || callbackUrl : null,
          appId:
            normalizeOptionalIdentifier(apiData?.id) ||
            (args.isSubscribed ? metaAppId || null : metaAppId || null),
          appName: normalizeOptionalString(apiData?.name),
          appLink: normalizeOptionalString(apiData?.link),
          verifyTokenLast4: metaWebhookVerifyToken ? last4(metaWebhookVerifyToken) : null,
          subscribedAt: args.isSubscribed
            ? normalizeOptionalString(existingSubscription.subscribedAt) || timestamp
            : null,
          unsubscribedAt: args.isSubscribed ? null : timestamp,
          lastCheckedAt: timestamp,
          lastError: args.lastError || null,
        },
      },
      updated_at: timestamp,
    })
    .eq('user_id', args.userId)
    .eq('id', args.row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function syncWhatsAppWebhookSubscription(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  req: Request;
  throwOnError?: boolean;
}) {
  try {
    requireMetaWebhookVerifyToken();
    const callbackUrl = getMetaWebhookCallbackUrl(args.req);
    await subscribeWhatsAppWebhookApp({
      accessToken: args.accessToken,
      wabaId: String(args.row.waba_id),
      callbackUrl,
      verifyToken: metaWebhookVerifyToken,
    });

    const subscriptions = await listWhatsAppSubscribedApps(
      args.accessToken,
      String(args.row.waba_id),
    );
    const entries = Array.isArray(subscriptions.data)
      ? subscriptions.data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];

    return persistWhatsAppWebhookSubscriptionStatus({
      userId: args.userId,
      row: args.row,
      req: args.req,
      entries,
      isSubscribed: true,
    });
  } catch (error) {
    const nextErrorMessage = mapDbError(error);
    const data = await persistWhatsAppWebhookSubscriptionStatus({
      userId: args.userId,
      row: args.row,
      req: args.req,
      entries: [],
      isSubscribed: false,
      lastError: nextErrorMessage,
    });

    if (args.throwOnError) {
      throw error;
    }

    return data;
  }
}

async function checkWhatsAppWebhookSubscription(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  req: Request;
}) {
  const subscriptions = await listWhatsAppSubscribedApps(args.accessToken, String(args.row.waba_id));
  const entries = Array.isArray(subscriptions.data)
    ? subscriptions.data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const matchedEntry = resolveWhatsAppWebhookSubscriptionEntry(entries);

  return persistWhatsAppWebhookSubscriptionStatus({
    userId: args.userId,
    row: args.row,
    req: args.req,
    entries,
    isSubscribed: Boolean(matchedEntry),
  });
}

async function deactivateWhatsAppWebhookSubscription(args: {
  userId: string;
  row: Record<string, unknown>;
  accessToken: string;
  req: Request;
}) {
  await unsubscribeWhatsAppWebhookApp(args.accessToken, String(args.row.waba_id));

  return persistWhatsAppWebhookSubscriptionStatus({
    userId: args.userId,
    row: args.row,
    req: args.req,
    entries: [],
    isSubscribed: false,
  });
}

async function subscribeMessengerPageToWebhook(accessToken: string, pageId: string) {
  return metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: `${pageId}/subscribed_apps`,
    method: 'POST',
    query: {
      subscribed_fields: DEFAULT_MESSENGER_WEBHOOK_FIELDS.join(','),
    },
  });
}

async function subscribeInstagramPageToWebhook(accessToken: string, pageId: string) {
  await subscribeMetaAppToPageMessagingWebhook(DEFAULT_INSTAGRAM_WEBHOOK_FIELDS);

  return metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken,
    path: `${pageId}/subscribed_apps`,
    method: 'POST',
    query: {
      subscribed_fields: DEFAULT_INSTAGRAM_WEBHOOK_FIELDS.join(','),
    },
  });
}

async function fetchInstagramAccountProfile(
  userAccessToken: string,
  pageAccessToken: string,
  instagramAccountId: string,
) {
  const query = {
    fields: 'id,username,name,profile_picture_url',
  };

  try {
    return await metaRequest<{
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>({
      accessToken: userAccessToken,
      path: instagramAccountId,
      query,
    });
  } catch {
    return metaRequest<{
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>({
      accessToken: pageAccessToken,
      path: instagramAccountId,
      query,
    });
  }
}

async function fetchMessengerUserProfile(accessToken: string, senderId: string) {
  type MessengerUserProfileResponse = {
    id?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    profile_pic?: string;
    profile_picture_url?: string;
  };

  let response: MessengerUserProfileResponse;

  try {
    response = await metaRequestDetailed<MessengerUserProfileResponse>({
      accessToken,
      path: senderId,
      query: {
        fields: 'id,name,first_name,last_name,profile_pic',
      },
    });
  } catch {
    response = await metaRequestDetailed<MessengerUserProfileResponse>({
      accessToken,
      path: senderId,
      query: {
        fields: 'id,first_name,last_name,profile_pic',
      },
    });
  }

  const firstName = normalizeOptionalString(response.first_name);
  const lastName = normalizeOptionalString(response.last_name);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    id: normalizeOptionalIdentifier(response.id) || senderId,
    name: normalizeOptionalString(response.name) || combinedName || null,
    profilePictureUrl:
      normalizeOptionalString(response.profile_pic) ||
      normalizeOptionalString(response.profile_picture_url),
  };
}

type MessengerPageConversationParticipant = {
  id?: string;
  name?: string;
  email?: string;
};

type MessengerPageConversationMessage = {
  id?: string;
  message?: string;
  created_time?: string;
  from?: MessengerPageConversationParticipant | null;
  to?: {
    data?: MessengerPageConversationParticipant[];
  } | null;
};

type MessengerPageConversation = {
  id?: string;
  participants?: {
    data?: MessengerPageConversationParticipant[];
  } | null;
  messages?: {
    data?: MessengerPageConversationMessage[];
  } | null;
};

async function fetchMessengerPageConversations(accessToken: string, pageId: string) {
  const response = await metaRequestDetailed<{
    data?: MessengerPageConversation[];
  }>({
    accessToken,
    path: `${pageId}/conversations`,
    query: {
      fields: 'participants,messages.limit(10){id,message,created_time,from,to}',
      limit: 25,
    },
  });

  return response.data || [];
}

type InstagramMessagingUserProfile = {
  id: string;
  name: string | null;
  username: string | null;
  profilePictureUrl: string | null;
};

type InstagramMessagingUserProfileResponse = {
  id?: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  profile_picture_url?: string;
};

function mapInstagramMessagingUserProfile(
  response: InstagramMessagingUserProfileResponse,
  senderId: string,
): InstagramMessagingUserProfile | null {
  const profilePictureUrl =
    normalizeOptionalString(response.profile_pic) ||
    normalizeOptionalString(response.profile_picture_url);
  const username = normalizeOptionalString(response.username);
  const name = normalizeOptionalString(response.name) || (username ? `@${username}` : null);

  if (!name && !username && !profilePictureUrl) {
    return null;
  }

  return {
    id: normalizeOptionalIdentifier(response.id) || senderId,
    name,
    username,
    profilePictureUrl,
  };
}

async function fetchInstagramMessagingUserProfile(args: {
  pageAccessToken?: string | null;
  userAccessToken?: string | null;
  senderId: string;
}): Promise<InstagramMessagingUserProfile | null> {
  const attempts: Array<{
    accessToken: string;
    graphHost: 'graph.facebook.com' | 'graph.instagram.com';
    fields: string;
  }> = [];
  const seenAttempts = new Set<string>();
  const addAttempt = (
    accessToken: string | null | undefined,
    graphHost: 'graph.facebook.com' | 'graph.instagram.com',
    fields: string,
  ) => {
    const normalizedToken = normalizeOptionalString(accessToken);
    if (!normalizedToken) {
      return;
    }

    const key = `${graphHost}:${fields}:${normalizedToken}`;
    if (seenAttempts.has(key)) {
      return;
    }

    seenAttempts.add(key);
    attempts.push({
      accessToken: normalizedToken,
      graphHost,
      fields,
    });
  };

  for (const fields of ['id,name,username,profile_pic', 'id,name,username,profile_picture_url']) {
    addAttempt(args.pageAccessToken, 'graph.facebook.com', fields);
  }

  for (const fields of ['id,name,username,profile_pic', 'id,name,username,profile_picture_url']) {
    addAttempt(args.userAccessToken, 'graph.instagram.com', fields);
    addAttempt(args.userAccessToken, 'graph.facebook.com', fields);
  }

  let bestProfile: InstagramMessagingUserProfile | null = null;
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const response = await metaRequestDetailed<InstagramMessagingUserProfileResponse>({
        accessToken: attempt.accessToken,
        path: args.senderId,
        graphHost: attempt.graphHost,
        query: {
          fields: attempt.fields,
        },
      });
      const profile = mapInstagramMessagingUserProfile(response, args.senderId);

      if (!profile) {
        continue;
      }

      if (profile.profilePictureUrl) {
        return profile;
      }

      bestProfile = bestProfile || profile;
    } catch (error) {
      lastError = error;
    }
  }

  if (bestProfile) {
    return bestProfile;
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function fetchInstagramMessagingUserProfileForChannel(
  channelRow: Record<string, unknown>,
  senderId: string,
) {
  const pageAccessTokenCiphertext = normalizeOptionalString(channelRow.page_access_token_ciphertext);
  const userAccessTokenCiphertext = normalizeOptionalString(channelRow.user_access_token_ciphertext);
  let pageAccessToken: string | null = null;
  let userAccessToken: string | null = null;

  if (pageAccessTokenCiphertext) {
    try {
      pageAccessToken = decryptAccessToken(pageAccessTokenCiphertext);
    } catch (error) {
      console.error('Failed to decrypt Instagram page access token for profile lookup:', error);
    }
  }

  if (userAccessTokenCiphertext) {
    try {
      userAccessToken = decryptAccessToken(userAccessTokenCiphertext);
    } catch (error) {
      console.error('Failed to decrypt Instagram user access token for profile lookup:', error);
    }
  }

  if (!pageAccessToken && !userAccessToken) {
    return null;
  }

  return fetchInstagramMessagingUserProfile({
    pageAccessToken,
    userAccessToken,
    senderId,
  });
}

async function listTemplates(accessToken: string, wabaId: string) {
  const templates: Array<Record<string, unknown>> = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 25; page += 1) {
    const response = await metaRequest<{
      data?: Array<Record<string, unknown>>;
      paging?: {
        cursors?: {
          after?: string;
        };
      };
    }>({
      accessToken,
      path: `${wabaId}/message_templates`,
      query: {
        limit: 100,
        after: after || undefined,
      },
    });

    templates.push(...(response.data || []));

    const nextAfter = normalizeOptionalString(response.paging?.cursors?.after);
    if (!nextAfter || seenCursors.has(nextAfter) || (response.data || []).length === 0) {
      break;
    }

    seenCursors.add(nextAfter);
    after = nextAfter;
  }

  return templates;
}

async function createRemoteTemplate(
  accessToken: string,
  wabaId: string,
  input: {
    name: string;
    category: string;
    language: string;
    components: Array<Record<string, unknown>>;
  },
) {
  return metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/message_templates`,
    method: 'POST',
    body: input,
  });
}

async function deleteRemoteTemplate(accessToken: string, wabaId: string, templateName: string) {
  return metaRequest<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/message_templates`,
    method: 'DELETE',
    query: {
      name: templateName,
    },
  });
}

interface NormalizedWhatsAppFlowInput {
  name: string;
  categories: WhatsAppFlowCategory[];
  schema: WhatsAppFlowField[];
  publish: boolean;
}

interface NormalizedWhatsAppFlowUpdateInput {
  name?: string;
  categories?: WhatsAppFlowCategory[];
  schema?: WhatsAppFlowField[];
}

function normalizeFlowCategory(value: unknown): WhatsAppFlowCategory | null {
  const normalized = normalizeOptionalString(value)?.toUpperCase().replace(/[\s-]+/g, '_');

  if (!normalized || !WHATSAPP_FLOW_CATEGORIES.has(normalized)) {
    return null;
  }

  return normalized as WhatsAppFlowCategory;
}

function normalizeFlowCategories(input: { category?: unknown; categories?: unknown }) {
  const source = Array.isArray(input.categories) ? input.categories : [input.category];
  const categories = source
    .map((value) => normalizeFlowCategory(value))
    .filter((value): value is WhatsAppFlowCategory => Boolean(value));
  const uniqueCategories = Array.from(new Set(categories));

  return uniqueCategories.length > 0 ? uniqueCategories.slice(0, 3) : (['OTHER'] as WhatsAppFlowCategory[]);
}

function normalizeFlowFieldType(value: unknown): WhatsAppFlowFieldType {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (normalized && WHATSAPP_FLOW_FIELD_TYPES.has(normalized)) {
    return normalized as WhatsAppFlowFieldType;
  }

  return 'text';
}

function normalizeFlowFieldId(value: unknown, label: string | null, index: number, seenIds: Set<string>) {
  const source = normalizeOptionalString(value) || label || `field_${index + 1}`;
  let base = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!base) {
    base = `field_${index + 1}`;
  }

  if (/^\d/.test(base)) {
    base = `field_${base}`;
  }

  base = base.slice(0, 42).replace(/_+$/g, '') || `field_${index + 1}`;

  let candidate = base;
  let suffix = 2;
  while (seenIds.has(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 48 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  seenIds.add(candidate);
  return candidate;
}

function normalizeFlowSelectOptions(value: unknown, fieldLabel: string) {
  const options = Array.isArray(value)
    ? value.map((entry) => normalizeOptionalString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
  const uniqueOptions = Array.from(new Set(options.map((entry) => entry.slice(0, 80))));

  if (uniqueOptions.length === 0) {
    throw new Error(`Add at least one option for the "${fieldLabel}" select field.`);
  }

  return uniqueOptions.slice(0, 50);
}

function normalizeFlowSchema(value: unknown, options: { requireFields: boolean }) {
  if (!Array.isArray(value)) {
    if (options.requireFields) {
      throw new Error('Add at least one field to the Flow.');
    }

    return [];
  }

  const seenIds = new Set<string>();
  const fields = value.slice(0, MAX_FLOW_FIELDS).map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error('Each Flow field must be an object.');
    }

    const label = normalizeOptionalString(entry.label);
    if (!label) {
      throw new Error('Each Flow field needs a label.');
    }

    const type = normalizeFlowFieldType(entry.type);
    const field: WhatsAppFlowField = {
      id: normalizeFlowFieldId(entry.id, label, index, seenIds),
      type,
      label: label.slice(0, 80),
      required: Boolean(entry.required),
    };

    if (type === 'select') {
      field.options = normalizeFlowSelectOptions(entry.options, field.label);
    }

    if (isRecord(entry.validation)) {
      field.validation = entry.validation;
    }

    return field;
  });

  if (options.requireFields && fields.length === 0) {
    throw new Error('Add at least one field to the Flow.');
  }

  return fields;
}

function normalizeStoredFlowSchema(value: unknown) {
  try {
    return normalizeFlowSchema(value, { requireFields: false });
  } catch {
    return [];
  }
}

function normalizeFlowCreateInput(input: WhatsAppFlowInput): NormalizedWhatsAppFlowInput {
  if (!isRecord(input)) {
    throw new Error('Flow details are required.');
  }

  const name = normalizeOptionalString(input.name);
  if (!name) {
    throw new Error('Flow name is required.');
  }

  return {
    name: name.slice(0, 120),
    categories: normalizeFlowCategories(input),
    schema: normalizeFlowSchema(input.schema, { requireFields: true }),
    publish: Boolean(input.publish),
  };
}

function normalizeFlowUpdateInput(input: WhatsAppFlowUpdateInput): NormalizedWhatsAppFlowUpdateInput {
  if (!isRecord(input)) {
    throw new Error('Flow details are required.');
  }

  const update: NormalizedWhatsAppFlowUpdateInput = {};

  if ('name' in input) {
    const name = normalizeOptionalString(input.name);
    if (!name) {
      throw new Error('Flow name is required.');
    }

    update.name = name.slice(0, 120);
  }

  if ('category' in input || 'categories' in input) {
    update.categories = normalizeFlowCategories(input);
  }

  if ('schema' in input) {
    update.schema = normalizeFlowSchema(input.schema, { requireFields: true });
  }

  return update;
}

function buildWhatsAppFlowFieldComponent(field: WhatsAppFlowField) {
  if (field.type === 'date') {
    return {
      type: 'DatePicker',
      name: field.id,
      label: field.label,
      required: field.required,
    };
  }

  if (field.type === 'select') {
    return {
      type: 'Dropdown',
      name: field.id,
      label: field.label,
      required: field.required,
      'data-source': (field.options || []).map((option) => ({
        id: option
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80) || option.slice(0, 80),
        title: option,
      })),
    };
  }

  const inputType = field.type === 'email' || field.type === 'phone' || field.type === 'number'
    ? field.type
    : 'text';

  return {
    type: 'TextInput',
    name: field.id,
    label: field.label,
    required: field.required,
    'input-type': inputType,
  };
}

function buildWhatsAppFlowJson(input: Pick<NormalizedWhatsAppFlowInput, 'name' | 'schema'>) {
  const payload = input.schema.reduce<Record<string, string>>((current, field) => {
    current[field.id] = '${form.' + field.id + '}';
    return current;
  }, {});

  return {
    version: whatsAppFlowJsonVersion,
    screens: [
      {
        id: 'FORM_SCREEN',
        title: input.name.slice(0, 30) || 'Flow',
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'flow_form',
              children: [
                ...input.schema.map((field) => buildWhatsAppFlowFieldComponent(field)),
                {
                  type: 'Footer',
                  label: 'Submit',
                  'on-click-action': {
                    name: 'complete',
                    payload,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function getWhatsAppFlowPlatformVersions() {
  return {
    flow_json_version: whatsAppFlowJsonVersion,
    data_api_version: whatsAppFlowDataApiVersion,
    message_version: whatsAppFlowMessageVersion,
  };
}

function getFlowValidationMessage(raw: Record<string, unknown> | null | undefined) {
  const validationErrors = Array.isArray(raw?.validation_errors) ? raw.validation_errors : [];
  const firstError = validationErrors.find((entry): entry is Record<string, unknown> => isRecord(entry));

  if (!firstError) {
    return null;
  }

  return (
    normalizeOptionalString(firstError.message) ||
    normalizeOptionalString(firstError.error) ||
    'Flow JSON has validation errors.'
  );
}

async function listRemoteFlows(accessToken: string, wabaId: string) {
  const response = await metaRequest<{
    data?: Array<Record<string, unknown>>;
  }>({
    accessToken,
    path: `${wabaId}/flows`,
    query: {
      limit: 100,
    },
  });

  return response.data || [];
}

async function createRemoteFlow(
  accessToken: string,
  wabaId: string,
  input: NormalizedWhatsAppFlowInput,
) {
  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${wabaId}/flows`,
    method: 'POST',
    body: {
      name: input.name,
      categories: input.categories,
      flow_json: JSON.stringify(buildWhatsAppFlowJson(input)),
      publish: input.publish,
    },
  });
}

async function updateRemoteFlowMetadata(
  accessToken: string,
  flowId: string,
  input: Pick<NormalizedWhatsAppFlowUpdateInput, 'name' | 'categories'>,
) {
  const body: Record<string, unknown> = {};

  if (input.name) {
    body.name = input.name;
  }

  if (input.categories) {
    body.categories = input.categories;
  }

  if (Object.keys(body).length === 0) {
    return { success: true };
  }

  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: flowId,
    method: 'POST',
    body,
  });
}

async function updateRemoteFlowJson(
  accessToken: string,
  flowId: string,
  flowJson: Record<string, unknown>,
) {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([JSON.stringify(flowJson, null, 2)], { type: 'application/json' }),
    'flow.json',
  );
  formData.append('name', 'flow.json');
  formData.append('asset_type', 'FLOW_JSON');

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${flowId}/assets`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        error_data?: {
          details?: string;
        };
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function publishRemoteFlow(accessToken: string, flowId: string) {
  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: `${flowId}/publish`,
    method: 'POST',
  });
}

async function deleteRemoteFlow(accessToken: string, flowId: string) {
  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: flowId,
    method: 'DELETE',
  });
}

async function fetchRemoteFlowPreview(accessToken: string, flowId: string) {
  return metaRequestDetailed<Record<string, unknown>>({
    accessToken,
    path: flowId,
    query: {
      fields:
        'id,name,categories,preview.invalidate(false),status,validation_errors,json_version,data_api_version,endpoint_uri,health_status',
    },
  });
}

function getRemoteFlowPreview(raw: Record<string, unknown>) {
  const preview = isRecord(raw.preview) ? (raw.preview as Record<string, unknown>) : null;

  return {
    previewUrl: normalizeOptionalString(preview?.preview_url),
    previewExpiresAt: normalizeOptionalString(preview?.expires_at),
  };
}

function getRemoteFlowCategories(raw: Record<string, unknown>) {
  return Array.isArray(raw.categories)
    ? raw.categories
        .map((entry) => normalizeFlowCategory(entry))
        .filter((entry): entry is WhatsAppFlowCategory => Boolean(entry))
    : [];
}

function mapFlow(row: Record<string, unknown>): WhatsAppFlow {
  const raw = isRecord(row.raw) ? (row.raw as Record<string, unknown>) : {};
  const preview = getRemoteFlowPreview(raw);
  const categories = Array.isArray(row.categories)
    ? row.categories
        .map((entry) => normalizeFlowCategory(entry))
        .filter((entry): entry is WhatsAppFlowCategory => Boolean(entry))
    : [];

  return {
    id: String(row.id),
    userId: String(row.user_id),
    metaChannelId: normalizeOptionalString(row.meta_channel_id),
    metaFlowId: normalizeOptionalString(row.meta_flow_id),
    name: normalizeOptionalString(row.flow_name) || 'Untitled Flow',
    status: normalizeOptionalString(row.status)?.toUpperCase() || 'DRAFT',
    categories,
    schema: normalizeStoredFlowSchema(row.field_schema),
    raw,
    previewUrl: normalizeOptionalString(row.preview_url) || preview.previewUrl,
    previewExpiresAt: normalizeOptionalString(row.preview_expires_at) || preview.previewExpiresAt,
    submissionCount: Number(row.submission_count || 0),
    lastSubmittedAt: normalizeOptionalString(row.last_submitted_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    lastError: normalizeOptionalString(row.last_error) || getFlowValidationMessage(raw),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function getFlowJsonFromRaw(raw: Record<string, unknown> | null | undefined) {
  const flowJson = raw?.flow_json;

  if (isRecord(flowJson)) {
    return flowJson as Record<string, unknown>;
  }

  if (typeof flowJson === 'string') {
    try {
      const parsed = JSON.parse(flowJson) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function getFlowEntryScreenFromRaw(raw: Record<string, unknown> | null | undefined) {
  const flowJson = getFlowJsonFromRaw(raw);
  const screens = Array.isArray(flowJson?.screens) ? flowJson.screens : [];
  const firstScreen = screens.find((screen): screen is Record<string, unknown> => isRecord(screen));

  return normalizeOptionalString(firstScreen?.id) || '';
}

function normalizeTemplateFlowJson(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return isRecord(parsed) ? { text: trimmed, raw: parsed as Record<string, unknown> } : null;
    } catch {
      throw new Error('Flow JSON must be valid JSON.');
    }
  }

  if (isRecord(value)) {
    return {
      text: JSON.stringify(value),
      raw: value as Record<string, unknown>,
    };
  }

  return null;
}

async function getStoredFlows(userId: string) {
  const { data, error } = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapFlow(row as Record<string, unknown>));
}

async function getStoredFlowRow(userId: string, flowId: string) {
  const { data, error } = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId)
    .eq('id', flowId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Flow not found.');
  }

  return data as Record<string, unknown>;
}

async function findStoredFlowRowByLocalOrMetaId(userId: string, flowId: string) {
  const { data: localData, error: localError } = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId)
    .eq('id', flowId)
    .maybeSingle();

  if (localError) {
    throw localError;
  }

  if (localData) {
    return localData as Record<string, unknown>;
  }

  const { data: metaData, error: metaError } = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId)
    .eq('meta_flow_id', flowId)
    .maybeSingle();

  if (metaError) {
    throw metaError;
  }

  return metaData ? (metaData as Record<string, unknown>) : null;
}

async function findStoredFlowRowByName(userId: string, flowName: string) {
  const { data, error } = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId)
    .eq('flow_name', flowName)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? (data as Record<string, unknown>) : null;
}

function parseFlowResponseJson(value: unknown) {
  const raw = normalizeOptionalString(value);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.replace(/\u00a0/g, ' ')) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getFlowReplyFromMessage(message: Record<string, unknown>) {
  if (normalizeOptionalString(message.type) !== 'interactive') {
    return null;
  }

  const interactive = isRecord(message.interactive) ? (message.interactive as Record<string, unknown>) : null;

  if (normalizeOptionalString(interactive?.type) !== 'nfm_reply') {
    return null;
  }

  const reply = isRecord(interactive?.nfm_reply) ? (interactive.nfm_reply as Record<string, unknown>) : null;

  if (normalizeOptionalString(reply?.name) !== 'flow') {
    return null;
  }

  const responses = parseFlowResponseJson(reply?.response_json);

  if (!responses) {
    return null;
  }

  return {
    body: normalizeOptionalString(reply?.body),
    responses,
    responseJson: normalizeOptionalString(reply?.response_json) || '',
  };
}

function extractFlowIdentifierFromToken(flowToken: string | null | undefined) {
  const token = normalizeOptionalString(flowToken);

  if (!token) {
    return null;
  }

  const localMatch = token.match(/(?:^|:)(?:flow|automation):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:$|:)/i);
  if (localMatch?.[1]) {
    return { type: 'local_or_meta_id' as const, value: localMatch[1] };
  }

  const metaMatch = token.match(/(?:^|:)meta-flow:([^:]+)(?:$|:)/i);
  if (metaMatch?.[1]) {
    return { type: 'local_or_meta_id' as const, value: metaMatch[1] };
  }

  const nameMatch = token.match(/(?:^|:)flow-name:([^:]+)(?:$|:)/i);
  if (nameMatch?.[1]) {
    return { type: 'name' as const, value: decodeURIComponent(nameMatch[1]) };
  }

  return null;
}

async function resolveFlowRowForSubmission(
  userId: string,
  responses: Record<string, unknown>,
) {
  const flowToken = normalizeOptionalString(responses.flow_token);
  const tokenIdentifier = extractFlowIdentifierFromToken(flowToken);

  if (tokenIdentifier?.type === 'local_or_meta_id') {
    const row = await findStoredFlowRowByLocalOrMetaId(userId, tokenIdentifier.value);
    if (row) {
      return row;
    }
  }

  if (tokenIdentifier?.type === 'name') {
    const row = await findStoredFlowRowByName(userId, tokenIdentifier.value);
    if (row) {
      return row;
    }
  }

  const responseFlowId = normalizeOptionalIdentifier(
    responses.flow_id ?? responses.flowId ?? responses.meta_flow_id ?? responses.metaFlowId,
  );
  if (responseFlowId) {
    const row = await findStoredFlowRowByLocalOrMetaId(userId, responseFlowId);
    if (row) {
      return row;
    }
  }

  const responseFlowName = normalizeOptionalString(responses.flow_name ?? responses.flowName);
  if (responseFlowName) {
    const row = await findStoredFlowRowByName(userId, responseFlowName);
    if (row) {
      return row;
    }
  }

  return null;
}

function toContactAttributeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function getFlowResponseFields(responses: Record<string, unknown>) {
  const reserved = new Set([
    'flow_token',
    'flow_id',
    'flowId',
    'meta_flow_id',
    'metaFlowId',
    'flow_name',
    'flowName',
  ]);

  return Object.fromEntries(
    Object.entries(responses).filter(([key]) => !reserved.has(key)),
  );
}

async function mergeFlowResponseAttributes(args: {
  userId: string;
  threadId: string;
  flow: WhatsAppFlow | null;
  responses: Record<string, unknown>;
}) {
  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('attributes')
    .eq('user_id', args.userId)
    .eq('id', args.threadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const existingAttributes = isRecord(data?.attributes) ? (data?.attributes as Record<string, unknown>) : {};
  const flowName = args.flow?.name || normalizeOptionalString(args.responses.flow_name ?? args.responses.flowName) || 'flow_response';
  const prefix = toContactAttributeKey(flowName) || 'flow_response';
  const responseFields = getFlowResponseFields(args.responses);
  const nextAttributes: Record<string, unknown> = {
    ...existingAttributes,
    [`${prefix}_content`]: responseFields,
  };

  for (const [key, value] of Object.entries(responseFields)) {
    const attributeKey = toContactAttributeKey(key);

    if (attributeKey) {
      nextAttributes[`${prefix}_${attributeKey}`] = value;
    }
  }

  const update = await adminSupabase
    .from('conversation_threads')
    .update({
      attributes: nextAttributes,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', args.userId)
    .eq('id', args.threadId);

  if (update.error) {
    throw update.error;
  }
}

async function recordFlowSubmission(args: {
  userId: string;
  threadId: string;
  contactId: string | null;
  messageId: string | null;
  responses: Record<string, unknown>;
  submittedAt: string;
}) {
  const flowRow = await resolveFlowRowForSubmission(args.userId, args.responses);
  const flow = flowRow ? mapFlow(flowRow) : null;
  const flowToken = normalizeOptionalString(args.responses.flow_token);

  const { error } = await adminSupabase.from('flow_submissions').insert({
    user_id: args.userId,
    meta_flow_id: flow?.id || null,
    thread_id: args.threadId,
    contact_id: args.contactId,
    flow_token: flowToken,
    message_id: args.messageId,
    responses: args.responses,
    submitted_at: args.submittedAt,
  });

  if (error) {
    throw error;
  }

  if (flow) {
    const { error: updateError } = await adminSupabase
      .from('meta_flows')
      .update({
        submission_count: flow.submissionCount + 1,
        last_submitted_at: args.submittedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', args.userId)
      .eq('id', flow.id);

    if (updateError) {
      throw updateError;
    }
  }

  await mergeFlowResponseAttributes({
    userId: args.userId,
    threadId: args.threadId,
    flow,
    responses: args.responses,
  });
}

async function syncFlows(userId: string) {
  const { row, accessToken } = await getChannelWithToken(userId);
  const wabaId = normalizeOptionalIdentifier(row.waba_id);

  if (!wabaId) {
    throw new Error('The connected WhatsApp channel is missing a WABA ID.');
  }

  const channelId = normalizeOptionalIdentifier(row.id);
  const remoteFlows = await listRemoteFlows(accessToken, wabaId);
  const existingResult = await adminSupabase
    .from('meta_flows')
    .select('*')
    .eq('user_id', userId);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingByMetaFlowId = new Map<string, Record<string, unknown>>();
  for (const existingFlow of existingResult.data || []) {
    const metaFlowId = normalizeOptionalIdentifier(existingFlow.meta_flow_id);
    if (metaFlowId) {
      existingByMetaFlowId.set(metaFlowId, existingFlow as Record<string, unknown>);
    }
  }

  const syncedAt = new Date().toISOString();
  for (const remoteFlow of remoteFlows) {
    const metaFlowId = normalizeOptionalIdentifier(remoteFlow.id);

    if (!metaFlowId) {
      continue;
    }

    const existingFlow = existingByMetaFlowId.get(metaFlowId);
    const existingRaw = isRecord(existingFlow?.raw) ? (existingFlow?.raw as Record<string, unknown>) : {};
    const raw = {
      ...existingRaw,
      ...remoteFlow,
      __connektly_versions: getWhatsAppFlowPlatformVersions(),
    };
    const remoteCategories = getRemoteFlowCategories(remoteFlow);
    const categories = remoteCategories.length > 0
      ? remoteCategories
      : Array.isArray(existingFlow?.categories)
        ? existingFlow.categories
            .map((entry) => normalizeFlowCategory(entry))
            .filter((entry): entry is WhatsAppFlowCategory => Boolean(entry))
        : (['OTHER'] as WhatsAppFlowCategory[]);

    const { error } = await adminSupabase.from('meta_flows').upsert(
      {
        user_id: userId,
        meta_channel_id: channelId,
        meta_flow_id: metaFlowId,
        flow_name:
          normalizeOptionalString(remoteFlow.name) ||
          normalizeOptionalString(existingFlow?.flow_name) ||
          'Untitled Flow',
        status:
          normalizeOptionalString(remoteFlow.status)?.toUpperCase() ||
          normalizeOptionalString(existingFlow?.status)?.toUpperCase() ||
          'DRAFT',
        categories,
        field_schema: existingFlow?.field_schema || [],
        raw,
        last_synced_at: syncedAt,
        last_error: getFlowValidationMessage(raw),
        updated_at: syncedAt,
      },
      {
        onConflict: 'user_id,meta_flow_id',
      },
    );

    if (error) {
      throw error;
    }
  }

  return getStoredFlows(userId);
}

interface RemoteWhatsAppMessageResponse {
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
  messaging_product?: string;
}

interface RemoteMetaMessagingResponse {
  recipient_id?: string;
  message_id?: string;
}

function normalizeMarketingMessageProductPolicy(
  value: unknown,
): MarketingMessageProductPolicy | null {
  if (value === 'CLOUD_API_FALLBACK' || value === 'STRICT') {
    return value;
  }

  return null;
}

function normalizeMarketingCampaignRecipients(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('At least one campaign recipient is required.');
  }

  const dedupedRecipients = new Map<
    string,
    {
      to: string;
      contactName: string | null;
      threadId: string | null;
    }
  >();

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const to = normalizeOutgoingWhatsAppRecipient(entry.to);

    if (!to) {
      continue;
    }

    const previous = dedupedRecipients.get(to);
    dedupedRecipients.set(to, {
      to,
      contactName: normalizeOptionalString(entry.contactName) || previous?.contactName || null,
      threadId: normalizeOptionalIdentifier(entry.threadId) || previous?.threadId || null,
    });
  }

  if (dedupedRecipients.size === 0) {
    throw new Error('At least one valid campaign recipient is required.');
  }

  return Array.from(dedupedRecipients.values());
}

function normalizeMarketingMessageStatus(
  value: unknown,
): MarketingCampaignRecipientResult['messageStatus'] {
  const normalized = normalizeOptionalString(value)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized === 'accepted' ||
    normalized === 'held_for_quality_assessment' ||
    normalized === 'paused'
  ) {
    return normalized;
  }

  return normalized;
}

function normalizeOutgoingWhatsAppRecipient(value: unknown) {
  return normalizePhoneLike(value) || normalizeOptionalString(value);
}

function normalizeOutgoingMessageContext(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const messageId = normalizeOptionalString(value.message_id);
  return messageId ? { message_id: messageId } : undefined;
}

function normalizeOutgoingMediaObject(
  value: unknown,
  options?: { allowCaption?: boolean; allowFilename?: boolean; label?: string },
) {
  if (!isRecord(value)) {
    throw new Error(`${options?.label || 'Media'} payload is required.`);
  }

  const id = normalizeOptionalIdentifier(value.id);
  const link = normalizeOptionalString(value.link);

  if (!id && !link) {
    throw new Error(`${options?.label || 'Media'} must include either id or link.`);
  }

  const normalized: Record<string, unknown> = {};

  if (id) {
    normalized.id = id;
  }

  if (link) {
    normalized.link = link;
  }

  if (options?.allowCaption) {
    const caption = normalizeOptionalString(value.caption);

    if (caption) {
      normalized.caption = caption;
    }
  }

  if (options?.allowFilename) {
    const filename = normalizeOptionalString(value.filename);

    if (filename) {
      normalized.filename = filename;
    }
  }

  return normalized;
}

function normalizeOutgoingInteractiveHeader(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = normalizeOptionalString(value.type);

  if (!type) {
    throw new Error('Interactive header type is required.');
  }

  if (type === 'text') {
    const text = normalizeOptionalString(value.text);

    if (!text) {
      throw new Error('Interactive header text is required.');
    }

    const normalizedHeader: Record<string, unknown> = {
      type,
      text,
    };
    const subText = normalizeOptionalString(value.sub_text);

    if (subText) {
      normalizedHeader.sub_text = subText;
    }

    return normalizedHeader;
  }

  if (type === 'image' || type === 'video' || type === 'document') {
    const normalizedHeader: Record<string, unknown> = {
      type,
      [type]: normalizeOutgoingMediaObject(value[type], {
        allowFilename: type === 'document',
        label: `Interactive ${type}`,
      }),
    };
    const subText = normalizeOptionalString(value.sub_text);

    if (subText) {
      normalizedHeader.sub_text = subText;
    }

    return normalizedHeader;
  }

  throw new Error(`Unsupported interactive header type: ${type}.`);
}

function normalizeOutgoingInteractiveObject(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Interactive payload is required.');
  }

  const type = normalizeOptionalString(value.type);

  if (!type) {
    throw new Error('Interactive type is required.');
  }

  if (!isRecord(value.action)) {
    throw new Error('Interactive action is required.');
  }

  let action = value.action;

  if (type === 'flow') {
    action = normalizeOutgoingFlowInteractiveAction(value.action);
  }

  const normalizedInteractive: Record<string, unknown> = {
    type,
    action,
  };

  const header = normalizeOutgoingInteractiveHeader(value.header);

  if (header) {
    normalizedInteractive.header = header;
  }

  if (isRecord(value.body)) {
    const text = normalizeOptionalString(value.body.text);

    if (text) {
      normalizedInteractive.body = {
        text,
      };
    }
  }

  if (isRecord(value.footer)) {
    const text = normalizeOptionalString(value.footer.text);

    if (text) {
      normalizedInteractive.footer = {
        text,
      };
    }
  }

  return normalizedInteractive;
}

function normalizeOutgoingFlowInteractiveAction(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Flow interactive action is required.');
  }

  const name = normalizeOptionalString(value.name);
  const parameters = isRecord(value.parameters) ? (value.parameters as Record<string, unknown>) : null;

  if (name !== 'flow' || !parameters) {
    throw new Error('Flow interactive messages require action.name="flow" and action.parameters.');
  }

  const flowMessageVersion = normalizeOptionalString(parameters.flow_message_version);
  const flowId = normalizeOptionalIdentifier(parameters.flow_id);
  const flowName = normalizeOptionalString(parameters.flow_name);
  const flowCta = normalizeOptionalString(parameters.flow_cta);
  const mode = normalizeOptionalString(parameters.mode)?.toLowerCase();
  const flowAction = normalizeOptionalString(parameters.flow_action)?.toLowerCase();
  const flowToken = normalizeOptionalString(parameters.flow_token);

  if (flowMessageVersion !== whatsAppFlowMessageVersion) {
    throw new Error(`Flow interactive messages require flow_message_version="${whatsAppFlowMessageVersion}".`);
  }

  if ((!flowId && !flowName) || (flowId && flowName)) {
    throw new Error('Flow interactive messages require exactly one of flow_id or flow_name.');
  }

  if (!flowCta) {
    throw new Error('Flow interactive messages require flow_cta.');
  }

  if (flowCta.length > 30) {
    throw new Error('Flow CTA text must be 30 characters or less.');
  }

  const normalizedParameters: Record<string, unknown> = {
    flow_message_version: whatsAppFlowMessageVersion,
    flow_token: flowToken || 'unused',
    flow_cta: flowCta,
    flow_action: flowAction === 'data_exchange' ? 'data_exchange' : 'navigate',
  };

  if (flowId) {
    normalizedParameters.flow_id = flowId;
  } else {
    normalizedParameters.flow_name = flowName;
  }

  if (mode === 'draft') {
    normalizedParameters.mode = 'draft';
  } else if (mode === 'published') {
    normalizedParameters.mode = 'published';
  }

  if (normalizedParameters.flow_action === 'navigate') {
    const payload = isRecord(parameters.flow_action_payload)
      ? (parameters.flow_action_payload as Record<string, unknown>)
      : null;
    const normalizedPayload: Record<string, unknown> = {};
    const screen = normalizeOptionalString(payload?.screen);

    if (screen) {
      normalizedPayload.screen = screen;
    }

    if (typeof payload?.data === 'string' && payload.data.trim()) {
      normalizedPayload.data = payload.data.trim();
    } else if (isRecord(payload?.data) && Object.keys(payload.data).length > 0) {
      normalizedPayload.data = JSON.stringify(payload.data);
    }

    if (Object.keys(normalizedPayload).length > 0) {
      normalizedParameters.flow_action_payload = normalizedPayload;
    }
  }

  return {
    name: 'flow',
    parameters: normalizedParameters,
  };
}

function normalizeOutgoingContacts(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('At least one contact is required.');
  }

  const contacts = value.filter(isRecord);

  if (contacts.length === 0) {
    throw new Error('At least one contact is required.');
  }

  return contacts;
}

function normalizeOutgoingLocation(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Location payload is required.');
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location latitude and longitude are required.');
  }

  const normalizedLocation: Record<string, unknown> = {
    latitude,
    longitude,
  };
  const name = normalizeOptionalString(value.name);
  const address = normalizeOptionalString(value.address);

  if (name) {
    normalizedLocation.name = name;
  }

  if (address) {
    normalizedLocation.address = address;
  }

  return normalizedLocation;
}

function normalizeOutgoingWhatsAppMessagePayload(payload: WhatsAppMessagePayload) {
  if (!isRecord(payload)) {
    throw new Error('A WhatsApp message payload is required.');
  }

  const to = normalizeOutgoingWhatsAppRecipient(payload.to);

  if (!to) {
    throw new Error('A valid recipient is required.');
  }

  const type = payload.type;

  if (!normalizeOptionalString(type)) {
    throw new Error('Message type is required.');
  }

  const normalizedPayload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: payload.recipient_type === 'group' ? 'group' : 'individual',
    to,
    type,
  };
  const context = normalizeOutgoingMessageContext(payload.context);

  if (context) {
    normalizedPayload.context = context;
  }

  switch (type) {
    case 'text': {
      if (!isRecord(payload.text)) {
        throw new Error('Text payload is required.');
      }

      const body = normalizeOptionalString(payload.text.body);

      if (!body) {
        throw new Error('Text body is required.');
      }

      normalizedPayload.text = {
        body,
        preview_url: payload.text.preview_url === true,
      };
      break;
    }
    case 'image':
      normalizedPayload.image = normalizeOutgoingMediaObject(payload.image, {
        allowCaption: true,
        label: 'Image',
      });
      break;
    case 'video':
      normalizedPayload.video = normalizeOutgoingMediaObject(payload.video, {
        allowCaption: true,
        label: 'Video',
      });
      break;
    case 'audio':
      normalizedPayload.audio = normalizeOutgoingMediaObject(payload.audio, {
        label: 'Audio',
      });
      break;
    case 'document':
      normalizedPayload.document = normalizeOutgoingMediaObject(payload.document, {
        allowCaption: true,
        allowFilename: true,
        label: 'Document',
      });
      break;
    case 'sticker':
      normalizedPayload.sticker = normalizeOutgoingMediaObject(payload.sticker, {
        label: 'Sticker',
      });
      break;
    case 'reaction': {
      if (!isRecord(payload.reaction)) {
        throw new Error('Reaction payload is required.');
      }

      const messageId = normalizeOptionalString(payload.reaction.message_id);
      const emoji = normalizeOptionalString(payload.reaction.emoji);

      if (!messageId || !emoji) {
        throw new Error('Reaction message_id and emoji are required.');
      }

      normalizedPayload.reaction = {
        message_id: messageId,
        emoji,
      };
      break;
    }
    case 'location':
      normalizedPayload.location = normalizeOutgoingLocation(payload.location);
      break;
    case 'contacts':
      normalizedPayload.contacts = normalizeOutgoingContacts(payload.contacts);
      break;
    case 'interactive':
      normalizedPayload.interactive = normalizeOutgoingInteractiveObject(payload.interactive);
      break;
    case 'template': {
      if (!isRecord(payload.template)) {
        throw new Error('Template payload is required.');
      }

      const name = normalizeOptionalString(payload.template.name);
      const languageCode = isRecord(payload.template.language)
        ? normalizeOptionalString(payload.template.language.code)
        : null;

      if (!name || !languageCode) {
        throw new Error('Template name and language code are required.');
      }

      const normalizedTemplate: Record<string, unknown> = {
        name,
        language: {
          code: languageCode,
        },
      };

      if (Array.isArray(payload.template.components)) {
        const components = payload.template.components.filter(isRecord);

        if (components.length > 0) {
          normalizedTemplate.components = components;
        }
      }

      normalizedPayload.template = normalizedTemplate;
      break;
    }
    default:
      throw new Error(`Unsupported WhatsApp message type: ${type}.`);
  }

  return normalizedPayload;
}

async function sendRemoteWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  payload: WhatsAppMessagePayload,
) {
  return metaRequest<RemoteWhatsAppMessageResponse>({
    accessToken,
    path: `${phoneNumberId}/messages`,
    method: 'POST',
    body: normalizeOutgoingWhatsAppMessagePayload(payload),
  });
}

async function sendRemoteMessengerTextMessage(args: {
  accessToken: string;
  pageId: string;
  recipientId: string;
  body: string;
}) {
  return metaRequest<RemoteMetaMessagingResponse>({
    accessToken: args.accessToken,
    path: `${args.pageId}/messages`,
    method: 'POST',
    body: {
      recipient: {
        id: args.recipientId,
      },
      messaging_type: 'RESPONSE',
      message: {
        text: args.body,
      },
    },
  });
}

async function sendRemoteInstagramTextMessage(args: {
  userAccessToken: string;
  pageAccessToken?: string;
  instagramAccountId: string;
  recipientId: string;
  body: string;
}) {
  const messagePayload = {
    recipient: {
      id: args.recipientId,
    },
    message: {
      text: args.body,
    },
  };
  const attempts: Array<{
    accessToken: string;
    graphHost: 'graph.instagram.com' | 'graph.facebook.com';
    path: string;
    body: Record<string, unknown>;
    label: string;
  }> = [];

  if (args.pageAccessToken) {
    attempts.push({
      accessToken: args.pageAccessToken,
      graphHost: 'graph.facebook.com',
      path: `${args.instagramAccountId}/messages`,
      body: messagePayload,
      label: 'Facebook Graph Instagram account messages',
    });
    attempts.push({
      accessToken: args.pageAccessToken,
      graphHost: 'graph.instagram.com',
      path: `${args.instagramAccountId}/messages`,
      body: messagePayload,
      label: 'Instagram Graph Instagram account messages with Page token',
    });
    attempts.push({
      accessToken: args.pageAccessToken,
      graphHost: 'graph.facebook.com',
      path: 'me/messages',
      body: messagePayload,
      label: 'Facebook Graph me/messages',
    });
    attempts.push({
      accessToken: args.pageAccessToken,
      graphHost: 'graph.facebook.com',
      path: `${args.instagramAccountId}/messages`,
      body: {
        ...messagePayload,
        messaging_type: 'RESPONSE',
      },
      label: 'Facebook Graph Instagram account messages with response type',
    });
    attempts.push({
      accessToken: args.pageAccessToken,
      graphHost: 'graph.facebook.com',
      path: 'me/messages',
      body: {
        ...messagePayload,
        messaging_type: 'RESPONSE',
      },
      label: 'Facebook Graph me/messages with response type',
    });
  }

  if (!args.pageAccessToken || args.pageAccessToken !== args.userAccessToken) {
    attempts.push({
      accessToken: args.userAccessToken,
      graphHost: 'graph.instagram.com',
      path: 'me/messages',
      body: messagePayload,
      label: 'Instagram Graph me/messages',
    });
    attempts.push({
      accessToken: args.userAccessToken,
      graphHost: 'graph.instagram.com',
      path: `${args.instagramAccountId}/messages`,
      body: messagePayload,
      label: 'Instagram Graph Instagram account messages',
    });
  }

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      return await metaRequest<RemoteMetaMessagingResponse>({
        accessToken: attempt.accessToken,
        path: attempt.path,
        method: 'POST',
        graphHost: attempt.graphHost,
        body: attempt.body,
      });
    } catch (error) {
      errors.push(`${attempt.label}: ${mapDbError(error)}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `Failed to send the Instagram message. ${errors.join(' | ')}`
      : 'Failed to send the Instagram message.',
  );
}

async function sendRemoteWhatsAppMarketingMessage(
  accessToken: string,
  phoneNumberId: string,
  payload: WhatsAppMessagePayload,
  options?: {
    productPolicy?: MarketingMessageProductPolicy;
    messageActivitySharing?: boolean;
  },
) {
  const basePayload = normalizeOutgoingWhatsAppMessagePayload(
    payload,
  ) as Record<string, unknown>;

  if (options?.productPolicy) {
    basePayload.product_policy = options.productPolicy;
  }

  if (typeof options?.messageActivitySharing === 'boolean') {
    basePayload.message_activity_sharing = options.messageActivitySharing;
  }

  return metaRequest<RemoteWhatsAppMessageResponse>({
    accessToken,
    path: `${phoneNumberId}/marketing_messages`,
    method: 'POST',
    body: basePayload,
  });
}

async function sendRemoteWhatsAppTemplateMessageForStoredCategory(args: {
  userId: string;
  accessToken: string;
  phoneNumberId: string;
  payload: WhatsAppMessagePayload;
}) {
  if (args.payload.type !== 'template') {
    return sendRemoteWhatsAppMessage(args.accessToken, args.phoneNumberId, args.payload);
  }

  const templateRecord = await getStoredTemplateRecord(
    args.userId,
    args.payload.template.name,
    args.payload.template.language.code,
  );

  if (templateRecord?.category === 'MARKETING') {
    return sendRemoteWhatsAppMarketingMessage(args.accessToken, args.phoneNumberId, args.payload, {
      productPolicy: 'CLOUD_API_FALLBACK',
      messageActivitySharing: true,
    });
  }

  return sendRemoteWhatsAppMessage(args.accessToken, args.phoneNumberId, args.payload);
}

async function uploadRemoteMedia(
  accessToken: string,
  phoneNumberId: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', new Blob([file.buffer], { type: file.mimeType }), file.fileName);

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${String(phoneNumberId).replace(/^\/+/, '')}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    let message = `Media upload failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      throw new Error(message);
    }

    throw new Error(message);
  }

  return (await response.json()) as { id: string };
}

async function uploadTemplateHeaderMedia(
  accessToken: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  if (!metaAppId) {
    throw new Error('META_APP_ID must be configured before uploading template header media.');
  }

  const uploadSession = await metaRequestDetailed<{ id?: string }>({
    accessToken,
    path: `${metaAppId}/uploads`,
    method: 'POST',
    query: {
      file_name: file.fileName,
      file_length: file.buffer.byteLength,
      file_type: file.mimeType,
    },
  });
  const uploadSessionId = normalizeOptionalString(uploadSession.id);

  if (!uploadSessionId) {
    throw new Error('Meta did not return a template media upload session.');
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${String(uploadSessionId).replace(/^\/+/, '')}`,
    {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        'Content-Type': file.mimeType,
        file_offset: '0',
      },
      body: new Blob([file.buffer], { type: file.mimeType }),
    },
  );

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  const uploaded = (await response.json()) as Record<string, unknown>;
  const headerMediaHandle =
    normalizeOptionalString(uploaded.h) ||
    normalizeOptionalString(uploaded.handle) ||
    normalizeOptionalString(uploaded.id);

  if (!headerMediaHandle) {
    throw new Error('Meta did not return a template media handle.');
  }

  return {
    headerMediaHandle,
  };
}

type TemplateHeaderMediaPreview = {
  url: string;
  fileName: string | null;
  mimeType: string | null;
};

function getTemplateHeaderMediaExtension(fileName: string, mimeType: string) {
  const extension = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, '');

  if (extension) {
    return extension.slice(0, 16);
  }

  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

async function saveTemplateHeaderMediaPreview(
  userId: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  const storageExtension = getTemplateHeaderMediaExtension(file.fileName, file.mimeType) || '.bin';
  const storageObjectPath = `${userId}/template-header-media/${crypto.randomUUID()}${storageExtension}`;

  try {
    const { error } = await adminSupabase.storage
      .from(TEMPLATE_HEADER_MEDIA_BUCKET)
      .upload(storageObjectPath, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const publicUrl = getStoragePublicUrl(TEMPLATE_HEADER_MEDIA_BUCKET, storageObjectPath);

    if (publicUrl) {
      return publicUrl;
    }

    throw new Error('Failed to resolve the uploaded template header media URL.');
  } catch (error) {
    throw error;
  }
}

async function saveTemplateHeaderMediaPreviewWithFallback(
  req: Request,
  userId: string,
  file: { buffer: Buffer; mimeType: string; fileName: string },
) {
  try {
    return await saveTemplateHeaderMediaPreview(userId, file);
  } catch (error) {
    console.error('Failed to store template header media in Supabase Storage, falling back to local disk:', error);
  }

  await fs.promises.mkdir(templateHeaderMediaDir, { recursive: true });

  const storedFileName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${getTemplateHeaderMediaExtension(
    file.fileName,
    file.mimeType,
  )}`;
  await fs.promises.writeFile(path.join(templateHeaderMediaDir, storedFileName), file.buffer);

  return new URL(`${TEMPLATE_HEADER_MEDIA_API_ROUTE}/${storedFileName}`, getRequestOrigin(req)).toString();
}

function normalizeTemplateHeaderMediaPreview(value: unknown): TemplateHeaderMediaPreview | null {
  if (!isRecord(value)) {
    return null;
  }

  const url = normalizeOptionalString(value.url);

  if (!url) {
    return null;
  }

  return {
    url,
    fileName: normalizeOptionalString(value.fileName),
    mimeType: normalizeOptionalString(value.mimeType),
  };
}

function mergeTemplateHeaderMediaPreview(
  raw: Record<string, unknown>,
  preview: TemplateHeaderMediaPreview | null,
) {
  if (!preview) {
    return raw;
  }

  return {
    ...raw,
    [TEMPLATE_HEADER_MEDIA_PREVIEW_KEY]: preview,
  };
}

function normalizeTemplateHeaderMediaPreviewUrlForSend(value: string) {
  try {
    const parsed = new URL(value, frontendOrigin);

    if (parsed.pathname.startsWith(`${TEMPLATE_HEADER_MEDIA_API_ROUTE}/`)) {
      return parsed.toString();
    }

    if (parsed.pathname.startsWith(`${TEMPLATE_HEADER_MEDIA_ROUTE}/`)) {
      return new URL(`${TEMPLATE_HEADER_MEDIA_API_ROUTE}${parsed.pathname.slice(TEMPLATE_HEADER_MEDIA_ROUTE.length)}${parsed.search}`, frontendOrigin).toString();
    }
  } catch {
    return value;
  }

  return value;
}

function resolveTemplateHeaderMediaPreviewLocalFile(value: string) {
  try {
    const parsed = new URL(value, frontendOrigin);
    const routePrefixes = [TEMPLATE_HEADER_MEDIA_API_ROUTE, TEMPLATE_HEADER_MEDIA_ROUTE];
    const matchedPrefix = routePrefixes.find((prefix) => parsed.pathname.startsWith(`${prefix}/`));

    if (!matchedPrefix) {
      return null;
    }

    const relativeFilePath = decodeURIComponent(parsed.pathname.slice(matchedPrefix.length + 1));
    const resolvedFilePath = path.resolve(templateHeaderMediaDir, relativeFilePath);
    const resolvedMediaDir = path.resolve(templateHeaderMediaDir);

    if (!resolvedFilePath.startsWith(`${resolvedMediaDir}${path.sep}`)) {
      return null;
    }

    return {
      relativeFilePath,
      resolvedFilePath,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
}

async function ensureTemplateHeaderMediaPreviewIsAvailable(preview: TemplateHeaderMediaPreview) {
  const localFile = resolveTemplateHeaderMediaPreviewLocalFile(preview.url);

  if (!localFile) {
    return;
  }

  if (
    !(await fs.promises.stat(localFile.resolvedFilePath).then((stats) => stats.isFile()).catch(() => false))
  ) {
    throw new Error(
      `The selected WhatsApp template uses a media header, but its stored preview file is missing (${localFile.relativeFilePath}). Re-upload the header media or recreate the template before sending it.`,
    );
  }
}

function getTemplateHeaderMediaPreviewFromRaw(raw: unknown) {
  const preview = isRecord(raw) ? normalizeTemplateHeaderMediaPreview(raw[TEMPLATE_HEADER_MEDIA_PREVIEW_KEY]) : null;

  return preview
    ? {
        ...preview,
        url: normalizeTemplateHeaderMediaPreviewUrlForSend(preview.url),
      }
    : null;
}

async function saveTemplateHeaderMediaPreviewMetadata(
  userId: string,
  templateName: string,
  language: string,
  preview: TemplateHeaderMediaPreview,
) {
  const existingResult = await adminSupabase
    .from('meta_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('template_name', templateName)
    .eq('language', language)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (!existingResult.data) {
    return null;
  }

  const raw = isRecord(existingResult.data.raw) ? existingResult.data.raw : {};
  const nextRaw = mergeTemplateHeaderMediaPreview(raw, preview);
  const { data, error } = await adminSupabase
    .from('meta_templates')
    .update({
      raw: nextRaw,
    })
    .eq('id', existingResult.data.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapTemplate(data as Record<string, unknown>);
}

async function migrateTemplateHeaderMediaPreviewToDurableUrl(
  userId: string,
  templateName: string,
  language: string,
  preview: TemplateHeaderMediaPreview,
) {
  const localFile = resolveTemplateHeaderMediaPreviewLocalFile(preview.url);

  if (!localFile) {
    return preview;
  }

  const exists = await fs.promises
    .stat(localFile.resolvedFilePath)
    .then((stats) => stats.isFile())
    .catch(() => false);

  if (!exists) {
    return preview;
  }

  try {
    const buffer = await fs.promises.readFile(localFile.resolvedFilePath);
    const nextPreview = {
      ...preview,
      url: await saveTemplateHeaderMediaPreview(
        userId,
        {
          buffer,
          mimeType: preview.mimeType || 'application/octet-stream',
          fileName: preview.fileName || path.basename(localFile.relativeFilePath),
        },
      ),
    } satisfies TemplateHeaderMediaPreview;

    await saveTemplateHeaderMediaPreviewMetadata(userId, templateName, language, nextPreview);
    return nextPreview;
  } catch (error) {
    console.error('Failed to migrate template header media preview to durable storage:', error);
    return preview;
  }
}

async function fetchRemoteMediaMetadata(accessToken: string, mediaId: string) {
  return metaRequest<{
    url?: string;
    mime_type?: string;
    sha256?: string;
    file_size?: number;
  }>({
    accessToken,
    path: mediaId,
  });
}

function mapProfile(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }

  return {
    userId: String(row.user_id),
    email: (row.email as string | null) || null,
    fullName: (row.full_name as string | null) || null,
    profilePictureUrl: normalizeOptionalString(row.profile_picture_url),
    companyLogoUrl: normalizeOptionalString(row.company_logo_url),
    countryCode: (row.country_code as string | null) || null,
    phone: (row.phone as string | null) || null,
    preferredCurrency: normalizeOptionalString(row.preferred_currency)
      ? normalizeCurrencyCode(row.preferred_currency)
      : null,
    companyName: (row.company_name as string | null) || null,
    companyWebsite: (row.company_website as string | null) || null,
    industry: (row.industry as string | null) || null,
    selectedPlan: (row.selected_plan as string | null) || null,
    billingCycle: normalizeBillingCycle(row.billing_cycle as string | null),
    billingStatus: normalizeBillingStatus(row.billing_status as string | null),
    trialEndsAt: (row.trial_ends_at as string | null) || null,
    freeTrialStartedAt: (row.free_trial_started_at as string | null) || null,
    couponCode: (row.coupon_code as string | null) || null,
    razorpaySubscriptionId: (row.razorpay_subscription_id as string | null) || null,
    onboardingCompleted: Boolean(row.onboarding_completed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapWorkspaceTeamMember(
  row: Record<string, unknown>,
  profileRow?: Record<string, unknown> | null,
): WorkspaceTeamMember {
  const memberUserId = normalizeOptionalIdentifier(row.member_user_id);

  return {
    id: String(row.id),
    workspaceOwnerUserId: String(row.workspace_owner_user_id),
    memberUserId,
    fullName: normalizeOptionalString(row.full_name) || normalizeOptionalString(profileRow?.full_name),
    email: String(row.invited_email || profileRow?.email || ''),
    profilePictureUrl: normalizeOptionalString(profileRow?.profile_picture_url),
    role: normalizeWorkspaceUserRole(row.role),
    status: normalizeWorkspaceUserStatus(row.status),
    invitedAt: String(row.invite_sent_at || row.created_at || new Date().toISOString()),
    acceptedAt: toIsoTimestamp(row.accepted_at as string | number | null | undefined),
    isOwner: false,
  };
}

function mapNotification(row: Record<string, unknown>): UserNotification {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: normalizeNotificationType(metadata.originalType || row.type),
    title: String(row.title || ''),
    body: String(row.body || ''),
    targetPath: normalizeOptionalString(row.target_path),
    isRead: Boolean(row.is_read),
    readAt: normalizeOptionalString(row.read_at),
    createdAt: String(row.created_at || new Date().toISOString()),
    metadata,
  };
}

function mapNotificationPreferences(
  row: Record<string, unknown> | null,
  userId: string,
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences(userId);

  if (!row) {
    return defaults;
  }

  return {
    userId: String(row.user_id || userId),
    enabled: normalizeBooleanPreference(row.enabled, defaults.enabled),
    soundEnabled: normalizeBooleanPreference(row.sound_enabled, defaults.soundEnabled),
    callSoundEnabled: normalizeBooleanPreference(
      row.call_sound_enabled,
      defaults.callSoundEnabled,
    ),
    soundPreset: normalizeNotificationSoundPreset(row.sound_preset),
    volume: normalizeNotificationVolume(row.volume, defaults.volume),
    incomingMessageEnabled: normalizeBooleanPreference(
      row.incoming_message_enabled,
      defaults.incomingMessageEnabled,
    ),
    incomingEmailEnabled: normalizeBooleanPreference(
      row.incoming_email_enabled,
      defaults.incomingEmailEnabled,
    ),
    templateReviewEnabled: normalizeBooleanPreference(
      row.template_review_enabled,
      defaults.templateReviewEnabled,
    ),
    missedCallEnabled: normalizeBooleanPreference(
      row.missed_call_enabled,
      defaults.missedCallEnabled,
    ),
    leadEnabled: normalizeBooleanPreference(row.lead_enabled, defaults.leadEnabled),
    campaignSentEnabled: normalizeBooleanPreference(
      row.campaign_sent_enabled,
      defaults.campaignSentEnabled,
    ),
    emailCampaignEnabled: normalizeBooleanPreference(
      row.email_campaign_enabled,
      defaults.emailCampaignEnabled,
    ),
    displayNameApprovedEnabled: normalizeBooleanPreference(
      row.display_name_approved_enabled,
      defaults.displayNameApprovedEnabled,
    ),
    teamJoinedEnabled: normalizeBooleanPreference(
      row.team_joined_enabled,
      defaults.teamJoinedEnabled,
    ),
    createdAt: String(row.created_at || defaults.createdAt),
    updatedAt: String(row.updated_at || defaults.updatedAt),
  };
}

function mapChannel(row: Record<string, unknown> | null): MetaChannelConnection | null {
  if (!row) {
    return null;
  }

  if (row.status === 'disconnected') {
    return null;
  }

  const metadata = isRecord(row.metadata) ? { ...(row.metadata as Record<string, unknown>) } : {};
  if (isRecord(metadata.catalogConnection)) {
    const catalogConnection = { ...(metadata.catalogConnection as Record<string, unknown>) };
    delete catalogConnection.accessTokenCiphertext;
    metadata.catalogConnection = catalogConnection;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    setupType: (row.setup_type as MetaChannelConnection['setupType']) || null,
    connectionMethod: row.connection_method as MetaChannelConnection['connectionMethod'],
    status: (row.status as MetaChannelConnection['status']) || 'connected',
    wabaId: String(row.waba_id),
    phoneNumberId: String(row.phone_number_id),
    displayPhoneNumber: (row.display_phone_number as string | null) || null,
    verifiedName: (row.verified_name as string | null) || null,
    qualityRating: (row.quality_rating as string | null) || null,
    messagingLimitTier: (row.messaging_limit_tier as string | null) || null,
    businessAccountName: (row.business_account_name as string | null) || null,
    accessTokenLast4: (row.access_token_last4 as string | null) || null,
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: (row.last_synced_at as string | null) || null,
    metadata,
  };
}

function mapInstagramChannel(row: Record<string, unknown> | null): InstagramChannelConnection | null {
  if (!row) {
    return null;
  }

  if (row.status === 'disconnected') {
    return null;
  }

  const metadata = (row.metadata as Record<string, unknown>) || {};
  const webhookSubscription = isRecord(metadata.webhookSubscription)
    ? metadata.webhookSubscription
    : {};

  return {
    id: String(row.id),
    userId: String(row.user_id),
    connectionMethod: row.connection_method as InstagramChannelConnection['connectionMethod'],
    status: (row.status as InstagramChannelConnection['status']) || 'connected',
    instagramAccountId: String(row.instagram_account_id),
    instagramUsername: normalizeOptionalString(row.instagram_username),
    instagramName: normalizeOptionalString(row.instagram_name),
    profilePictureUrl: normalizeOptionalString(row.profile_picture_url),
    pageId: String(row.page_id),
    pageName: normalizeOptionalString(row.page_name),
    userAccessTokenLast4: normalizeOptionalString(row.user_access_token_last4),
    pageAccessTokenLast4: normalizeOptionalString(row.page_access_token_last4),
    webhookFields: normalizeStringArray(webhookSubscription.fields),
    webhookSubscribed: Boolean(webhookSubscription.subscribed),
    webhookLastError: normalizeOptionalString(webhookSubscription.lastError),
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    metadata,
  };
}

function mapMessengerChannel(row: Record<string, unknown> | null): MessengerChannelConnection | null {
  if (!row) {
    return null;
  }

  if (row.status === 'disconnected') {
    return null;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    connectionMethod: row.connection_method as MessengerChannelConnection['connectionMethod'],
    status: (row.status as MessengerChannelConnection['status']) || 'connected',
    pageId: String(row.page_id),
    pageName: normalizeOptionalString(row.page_name),
    pagePictureUrl: normalizeOptionalString(row.page_picture_url),
    pageTasks: normalizeStringArray(row.page_tasks, { uppercase: true }),
    pageAccessTokenLast4: normalizeOptionalString(row.page_access_token_last4),
    webhookFields: normalizeStringArray(row.webhook_fields),
    webhookSubscribed: Boolean(row.webhook_subscribed),
    webhookLastError: normalizeOptionalString(row.webhook_last_error),
    connectedAt: String(row.connected_at || row.created_at),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    metadata: (row.metadata as Record<string, unknown>) || {},
  };
}

function mapEmailConnection(row: Record<string, unknown> | null): EmailConnectionSummary | null {
  if (!row) {
    return null;
  }

  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || ''),
    emailAddress: String(row.email_address || ''),
    authUser: String(row.auth_user || ''),
    smtpHost: String(row.smtp_host || ''),
    smtpPort: Number(row.smtp_port || 0),
    smtpSecure: Boolean(row.smtp_secure),
    imapHost: String(row.imap_host || ''),
    imapPort: Number(row.imap_port || 0),
    imapSecure: Boolean(row.imap_secure),
    status: (normalizeOptionalString(row.status) as EmailConnectionStatus | null) || 'connected',
    lastVerifiedAt: normalizeOptionalString(row.last_verified_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapEmailTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name || ''),
    subject: String(row.subject || ''),
    editorMode: normalizeEmailTemplateEditorMode(row.editor_mode),
    htmlContent: String(row.html_content || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapEmailCampaign(row: Record<string, unknown>): EmailCampaign {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    templateId: normalizeOptionalIdentifier(row.email_template_id),
    templateName: normalizeOptionalString(row.template_name),
    campaignName: String(row.campaign_name || ''),
    subject: String(row.subject || ''),
    htmlContent: String(row.html_content || ''),
    audienceSource: row.audience_source === 'custom' ? 'custom' : 'contacts',
    recipientCount: Number(row.recipient_count || 0),
    status:
      row.status === 'partial' || row.status === 'failed'
        ? row.status
        : 'sent',
    sentAt: normalizeOptionalString(row.sent_at),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function mapTemplate(row: Record<string, unknown>): MetaTemplate {
  return {
    id: String(row.id),
    metaTemplateId: (row.meta_template_id as string | null) || null,
    name: String(row.template_name),
    category: (row.category as string | null) || null,
    language: String(row.language),
    status: (row.status as string | null) || null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function getThreadSource(row: Record<string, unknown>) {
  const source = normalizeOptionalString(row.source)?.toLowerCase();
  return source || null;
}

function getThreadContactIdentity(row: Record<string, unknown>) {
  return normalizeOptionalString(row.contact_wa_id) || '';
}

function getPrefixedThreadIdentity(row: Record<string, unknown>, prefix: 'messenger' | 'instagram') {
  const expectedPrefix = `${prefix}:`;
  const contactIdentity = getThreadContactIdentity(row);

  if (contactIdentity.toLowerCase().startsWith(expectedPrefix)) {
    return contactIdentity.slice(expectedPrefix.length);
  }

  return null;
}

function looksLikeMessengerPsid(value: unknown) {
  const digitsOnly = normalizePhoneLike(value);
  return Boolean(digitsOnly && digitsOnly.length > 15);
}

function isMessengerThreadRow(row: Record<string, unknown>) {
  const source = getThreadSource(row);
  const contactIdentity = getThreadContactIdentity(row).toLowerCase();

  return source === 'messenger' || contactIdentity.startsWith('messenger:');
}

function isInstagramThreadRow(row: Record<string, unknown>) {
  const source = getThreadSource(row);
  const contactIdentity = getThreadContactIdentity(row).toLowerCase();

  return source === 'instagram' || contactIdentity.startsWith('instagram:');
}

function isExternalMessagingThreadRow(row: Record<string, unknown>) {
  return isMessengerThreadRow(row) || isInstagramThreadRow(row);
}

function getExternalThreadDisplayIdentity(row: Record<string, unknown>, prefix: 'messenger' | 'instagram') {
  const displayIdentity = normalizeOptionalString(row.display_phone);
  const prefixedIdentity = getPrefixedThreadIdentity(row, prefix);
  const contactIdentity = normalizeOptionalString(row.contact_wa_id);

  if (displayIdentity) {
    const displayDigits = normalizePhoneLike(displayIdentity);

    if (displayDigits && displayDigits.length > 15) {
      return displayDigits;
    }

    return displayIdentity.startsWith(`${prefix}:`) ? displayIdentity.slice(prefix.length + 1) : displayIdentity;
  }

  return prefixedIdentity || contactIdentity || null;
}

function normalizeMessengerSenderId(value: unknown) {
  const identity = normalizeOptionalString(value);

  if (!identity) {
    return null;
  }

  if (identity.toLowerCase().startsWith('messenger:')) {
    return identity.slice('messenger:'.length);
  }

  const digitsOnly = normalizePhoneLike(identity);
  return digitsOnly && digitsOnly.length > 15 ? digitsOnly : identity;
}

function getMessengerSenderIdFromThreadRow(row: Record<string, unknown>) {
  const source = getThreadSource(row);
  const prefixedIdentity = getPrefixedThreadIdentity(row, 'messenger');

  if (prefixedIdentity) {
    return normalizeMessengerSenderId(prefixedIdentity);
  }

  if (source === 'messenger') {
    return normalizeMessengerSenderId(row.display_phone) || normalizeMessengerSenderId(row.contact_wa_id);
  }

  if (!source && looksLikeMessengerPsid(row.display_phone || row.contact_wa_id)) {
    return normalizeMessengerSenderId(row.display_phone) || normalizeMessengerSenderId(row.contact_wa_id);
  }

  return null;
}

function normalizeInstagramSenderId(value: unknown) {
  const identity = normalizeOptionalString(value);

  if (!identity || identity.startsWith('@')) {
    return null;
  }

  if (identity.toLowerCase().startsWith('instagram:')) {
    return identity.slice('instagram:'.length);
  }

  return identity;
}

function getInstagramSenderIdFromThreadRow(row: Record<string, unknown>) {
  const source = getThreadSource(row);
  const prefixedIdentity = getPrefixedThreadIdentity(row, 'instagram');

  if (prefixedIdentity) {
    return normalizeInstagramSenderId(prefixedIdentity);
  }

  if (source === 'instagram') {
    return normalizeInstagramSenderId(row.contact_wa_id) || normalizeInstagramSenderId(row.display_phone);
  }

  return null;
}

function getThreadDisplayPhone(row: Record<string, unknown>) {
  if (isMessengerThreadRow(row)) {
    return getExternalThreadDisplayIdentity(row, 'messenger');
  }

  if (isInstagramThreadRow(row)) {
    return getExternalThreadDisplayIdentity(row, 'instagram');
  }

  return (
    formatContactIdentity(row.display_phone) ||
    (normalizePhoneLike(row.contact_wa_id) ? formatContactIdentity(row.contact_wa_id) : null) ||
    null
  );
}

function mapThread(row: Record<string, unknown>): ConversationThread {
  return {
    id: String(row.id),
    contactWaId: normalizeContactIdentity(row.contact_wa_id) || String(row.contact_wa_id),
    contactName: (row.contact_name as string | null) || null,
    username: normalizeOptionalString(row.username),
    displayPhone: getThreadDisplayPhone(row),
    email: (row.email as string | null) || null,
    source: (row.source as string | null) || null,
    remark: (row.remark as string | null) || null,
    attributes: isRecord(row.attributes) ? (row.attributes as Record<string, unknown>) : {},
    avatarUrl: (row.avatar_url as string | null) || null,
    status: normalizeStatus(row.status as string | null),
    priority: normalizePriority(row.priority as string | null),
    labels: Array.isArray(row.labels) ? (row.labels as string[]) : [],
    marketingOptedOut: Boolean(row.marketing_opted_out),
    ownerName: (row.owner_name as string | null) || null,
    lastMessageText: (row.last_message_text as string | null) || null,
    lastMessageAt: (row.last_message_at as string | null) || null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMessage(row: Record<string, unknown>): ConversationMessage {
  const direction = row.direction as ConversationMessage['direction'];

  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    waMessageId: (row.wa_message_id as string | null) || null,
    direction,
    messageType: String(row.message_type),
    body: (row.body as string | null) || null,
    senderName: (row.sender_name as string | null) || null,
    senderWaId:
      direction === 'inbound'
        ? formatContactIdentity(row.sender_wa_id) || normalizeOptionalString(row.sender_wa_id)
        : normalizeOptionalString(row.sender_wa_id),
    recipientWaId:
      direction === 'outbound'
        ? formatContactIdentity(row.recipient_wa_id) || normalizeOptionalString(row.recipient_wa_id)
        : normalizeOptionalString(row.recipient_wa_id),
    templateName: (row.template_name as string | null) || null,
    status: (row.status as string | null) || null,
    createdAt: String(row.created_at),
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function mapCall(row: Record<string, unknown>): CallLog {
  return {
    id: String(row.id),
    callId: (row.call_id as string | null) || null,
    name: (row.name as string | null) || null,
    phone: formatContactIdentity(row.phone) || String(row.phone),
    type: row.type as CallLog['type'],
    createdAt: String(row.created_at),
    durationSeconds: Number(row.duration_seconds || 0),
  };
}

function mapCallSession(row: Record<string, unknown>): WhatsAppCallSessionRecord {
  return {
    id: String(row.id),
    callId: String(row.call_id),
    contactWaId: normalizeContactIdentity(row.contact_wa_id),
    contactName: (row.contact_name as string | null) || null,
    displayPhone: getThreadDisplayPhone(row),
    direction: normalizeCallDirection(row.direction),
    state: normalizeCallState(row.state) || 'dialing',
    startedAt: String(row.started_at || row.created_at),
    connectedAt: (row.connected_at as string | null) || null,
    updatedAt: String(row.updated_at || row.created_at),
    endedAt: (row.ended_at as string | null) || null,
    offerSdp: (row.offer_sdp as string | null) || null,
    answerSdp: (row.answer_sdp as string | null) || null,
    bizOpaqueCallbackData: (row.biz_opaque_callback_data as string | null) || null,
    lastEvent: (row.last_event as string | null) || null,
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

function mapMetaLeadCaptureConfig(row: Record<string, unknown>, callbackUrl: string): MetaLeadCaptureConfig {
  const status = normalizeOptionalString(row.status);

  return {
    userId: String(row.user_id),
    metaChannelId: normalizeOptionalString(row.meta_channel_id),
    status: status === 'ready' || status === 'error' ? status : 'draft',
    appId: normalizeOptionalString(row.app_id),
    pageIds: Array.isArray(row.page_ids) ? (row.page_ids as string[]).filter(Boolean) : [],
    formIds: Array.isArray(row.form_ids) ? (row.form_ids as string[]).filter(Boolean) : [],
    accessTokenLast4: normalizeOptionalString(row.access_token_last4),
    verifyToken: String(row.verify_token || ''),
    verifiedAt: normalizeOptionalString(row.verified_at),
    callbackUrl,
    defaultOwnerName: normalizeOptionalString(row.default_owner_name),
    defaultLabels: Array.isArray(row.default_labels) ? (row.default_labels as string[]).filter(Boolean) : [],
    autoCreateLeads: Boolean(row.auto_create_leads),
    lastWebhookAt: normalizeOptionalString(row.last_webhook_at),
    lastLeadSyncedAt: normalizeOptionalString(row.last_lead_synced_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapMetaLeadCaptureEvent(row: Record<string, unknown>): MetaLeadCaptureEvent {
  const processingStatus = normalizeOptionalString(row.processing_status);

  return {
    id: String(row.id),
    userId: String(row.user_id),
    pageId: normalizeOptionalIdentifier(row.page_id),
    formId: normalizeOptionalIdentifier(row.form_id),
    leadId: normalizeOptionalIdentifier(row.lead_id),
    eventTime: normalizeOptionalString(row.event_time),
    processingStatus:
      processingStatus === 'processed' || processingStatus === 'skipped' || processingStatus === 'error'
        ? processingStatus
        : 'received',
    errorMessage: normalizeOptionalString(row.error_message),
    raw: (row.raw as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
  };
}

function normalizeMetaSubscribedFields(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => normalizeOptionalString(entry)?.toLowerCase())
          .filter((entry): entry is string => Boolean(entry)),
      ),
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(/[,\s]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

async function insertCallLog(args: {
  userId: string;
  callId?: string | null;
  phone: string;
  type: CallLog['type'];
  name?: string | null;
  durationSeconds?: number;
}) {
  const normalizedPhone = normalizePhoneLike(args.phone);

  if (!normalizedPhone) {
    return null;
  }

  const payload = {
    user_id: args.userId,
    call_id: normalizeOptionalString(args.callId) || null,
    name: normalizeOptionalString(args.name) || null,
    phone: normalizedPhone,
    type: args.type,
    duration_seconds: Number(args.durationSeconds || 0),
  };

  const query = adminSupabase.from('call_logs');
  const result = payload.call_id
    ? await query.upsert(payload, { onConflict: 'user_id,call_id' }).select('*').single()
    : await query.insert(payload).select('*').single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  return mapCall(data as Record<string, unknown>);
}

async function upsertCallSession(args: {
  userId: string;
  metaChannelId?: string | null;
  callId: string;
  contactWaId?: string | null;
  contactName?: string | null;
  displayPhone?: string | null;
  direction?: WhatsAppCallDirection;
  state?: WhatsAppCallState;
  startedAt?: string | null;
  connectedAt?: string | null;
  endedAt?: string | null;
  offerSdp?: string | null;
  answerSdp?: string | null;
  bizOpaqueCallbackData?: string | null;
  lastEvent?: string | null;
  raw?: Record<string, unknown>;
}) {
  const payload: Record<string, unknown> = {
    user_id: args.userId,
    meta_channel_id: args.metaChannelId || null,
    call_id: args.callId,
  };

  if (args.contactWaId !== undefined) {
    payload.contact_wa_id = normalizePhoneLike(args.contactWaId) || null;
  }

  if (args.contactName !== undefined) {
    payload.contact_name = normalizeOptionalString(args.contactName) || null;
  }

  if (args.displayPhone !== undefined) {
    payload.display_phone = formatContactIdentity(args.displayPhone) || normalizeOptionalString(args.displayPhone);
  }

  if (args.direction) {
    payload.direction = args.direction;
  }

  if (args.state) {
    payload.state = args.state;
  }

  if (args.startedAt !== undefined) {
    payload.started_at = args.startedAt || null;
  }

  if (args.connectedAt !== undefined) {
    payload.connected_at = args.connectedAt || null;
  }

  if (args.endedAt !== undefined) {
    payload.ended_at = args.endedAt || null;
  }

  if (args.offerSdp !== undefined) {
    payload.offer_sdp = normalizeSdpString(args.offerSdp) || null;
  }

  if (args.answerSdp !== undefined) {
    payload.answer_sdp = normalizeSdpString(args.answerSdp) || null;
  }

  if (args.bizOpaqueCallbackData !== undefined) {
    payload.biz_opaque_callback_data = normalizeOptionalString(args.bizOpaqueCallbackData) || null;
  }

  if (args.lastEvent !== undefined) {
    payload.last_event = normalizeOptionalString(args.lastEvent) || null;
  }

  if (args.raw !== undefined) {
    payload.raw = args.raw;
  }

  const { data, error } = await adminSupabase
    .from('call_sessions')
    .upsert(payload, { onConflict: 'user_id,call_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapCallSession(data as Record<string, unknown>);
}

async function syncCallLogFromSession(userId: string, session: WhatsAppCallSessionRecord) {
  const phone = session.displayPhone || session.contactWaId;

  if (!phone) {
    return null;
  }

  const connectedAtMs = session.connectedAt ? Date.parse(session.connectedAt) : Number.NaN;
  const startedAtMs = Number.isFinite(connectedAtMs) ? connectedAtMs : Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;
  const durationSeconds =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
      ? Math.round((endedAtMs - startedAtMs) / 1000)
      : 0;

  return insertCallLog({
    userId,
    callId: session.callId,
    phone,
    type: getCallLogTypeFromSession(session),
    name: session.contactName,
    durationSeconds,
  });
}

function isWhatsAppCloudMessageId(value: unknown) {
  const messageId = normalizeOptionalString(value);
  return Boolean(messageId && messageId.startsWith('wamid.'));
}

async function markRemoteWhatsAppMessageRead(
  accessToken: string,
  phoneNumberId: string,
  messageId: string,
) {
  const response = await metaRequestDetailed<{ success?: boolean }>({
    accessToken,
    path: `${phoneNumberId}/messages`,
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    },
  });

  if (response.success === false) {
    throw new Error('WhatsApp did not confirm the read receipt update.');
  }

  return true;
}

async function upsertCallSummaryMessage(args: {
  userId: string;
  metaChannelId: string | null;
  session: WhatsAppCallSessionRecord;
}) {
  const session = args.session;
  const contactWaId = session.contactWaId || session.displayPhone;

  if (!contactWaId || !isTerminalCallState(session.state)) {
    return null;
  }

  const summaryLabel = formatCallStateLabel(session.state);
  const previewText = `${session.direction === 'incoming' ? 'Incoming' : 'Outgoing'} WhatsApp call • ${summaryLabel}`;
  const createdAt = session.endedAt || session.updatedAt || new Date().toISOString();
  const connectedAtMs = session.connectedAt ? Date.parse(session.connectedAt) : Number.NaN;
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Number.NaN;
  const durationSeconds =
    Number.isFinite(connectedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= connectedAtMs
      ? Math.round((endedAtMs - connectedAtMs) / 1000)
      : 0;

  const thread = await upsertThread({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    contactWaId,
    contactName: session.contactName,
    displayPhone: session.displayPhone || contactWaId,
    lastMessageText: previewText,
    lastMessageAt: createdAt,
    unreadDelta: session.direction === 'incoming' ? 1 : 0,
  });

  return insertMessage({
    userId: args.userId,
    threadId: thread.id,
    waMessageId: `call-summary:${session.callId}`,
    direction: session.direction === 'incoming' ? 'inbound' : 'outbound',
    messageType: 'call_summary',
    body: previewText,
    senderName: session.direction === 'incoming' ? session.contactName : null,
    senderWaId: session.direction === 'incoming' ? contactWaId : null,
    recipientWaId: session.direction === 'outgoing' ? contactWaId : null,
    status: 'delivered',
    raw: {
      call_summary: {
        call_id: session.callId,
        direction: session.direction,
        state: session.state,
        started_at: session.startedAt,
        connected_at: session.connectedAt,
        ended_at: session.endedAt,
        duration_seconds: durationSeconds,
        contact_name: session.contactName,
        phone: session.displayPhone || contactWaId,
        last_event: session.lastEvent,
      },
    },
  });
}

async function maybeCreateMissedCallNotification(session: WhatsAppCallSessionRecord, userId: string) {
  if (session.state !== 'missed') {
    return;
  }

  const callerLabel =
    session.contactName || session.displayPhone || session.contactWaId || 'a WhatsApp caller';

  await createUserNotification({
    userId,
    type: 'missed_call',
    title: 'Missed WhatsApp call',
    body: `You missed a call from ${callerLabel}.`,
    targetPath: '/dashboard/calls',
    metadata: {
      callId: session.callId,
      contactWaId: session.contactWaId,
      contactName: session.contactName,
      phone: session.displayPhone || session.contactWaId,
      state: session.state,
    },
    dedupeKey: `missed-call:${session.callId}`,
  });
}

function buildCallSessionFromManageAction(args: {
  callId: string;
  input: WhatsAppCallManageInput;
  startedAt?: string;
}): Pick<
  WhatsAppCallSessionRecord,
  | 'callId'
  | 'contactWaId'
  | 'displayPhone'
  | 'direction'
  | 'state'
  | 'startedAt'
  | 'connectedAt'
  | 'endedAt'
  | 'offerSdp'
  | 'answerSdp'
  | 'bizOpaqueCallbackData'
  | 'lastEvent'
> {
  const startedAt = args.startedAt || new Date().toISOString();
  const normalizedTo = normalizePhoneLike(args.input.to);

  switch (args.input.action) {
    case 'connect':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'dialing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: normalizeSdpString(args.input.session?.sdp) || null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'connect_request',
      };
    case 'accept':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'connecting',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: normalizeSdpString(args.input.session?.sdp) || null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'accept_request',
      };
    case 'pre_accept':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'ringing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'pre_accept_request',
      };
    case 'reject':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'incoming',
        state: 'rejected',
        startedAt,
        connectedAt: null,
        endedAt: new Date().toISOString(),
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'reject_request',
      };
    case 'terminate':
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'ended',
        startedAt,
        connectedAt: null,
        endedAt: new Date().toISOString(),
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: 'terminate_request',
      };
    default:
      return {
        callId: args.callId,
        contactWaId: normalizedTo,
        displayPhone: normalizedTo,
        direction: 'outgoing',
        state: 'dialing',
        startedAt,
        connectedAt: null,
        endedAt: null,
        offerSdp: null,
        answerSdp: null,
        bizOpaqueCallbackData: normalizeOptionalString(args.input.bizOpaqueCallbackData) || null,
        lastEvent: `${args.input.action}_request`,
      };
  }
}

async function handleCallWebhookEntry(args: {
  userId: string;
  metaChannelId: string;
  callRecord: Record<string, unknown>;
  fallbackContactName?: string | null;
}) {
  const callId =
    normalizeOptionalString(args.callRecord.id) ||
    normalizeOptionalString(args.callRecord.call_id) ||
    null;

  if (!callId) {
    return null;
  }

  const direction = normalizeCallDirection(
    args.callRecord.direction || args.callRecord.call_direction || args.callRecord.initiated_by,
  );
  const session = isRecord(args.callRecord.session) ? args.callRecord.session : null;
  const sessionSdpType = normalizeOptionalString(session?.sdp_type);
  const sessionSdp = normalizeSdpString(session?.sdp) || null;
  const eventName =
    normalizeOptionalString(args.callRecord.event) ||
    normalizeOptionalString(args.callRecord.status) ||
    normalizeOptionalString(args.callRecord.call_status);
  const statusName = normalizeOptionalString(args.callRecord.status);
  const startedAt = toIsoTimestamp(
    (args.callRecord.timestamp as string | number | null | undefined) ||
      (args.callRecord.created_at as string | number | null | undefined) ||
      (args.callRecord.updated_at as string | number | null | undefined),
  );
  const contactWaId =
    direction === 'incoming'
      ? extractPhoneLike(args.callRecord.from) ||
        extractPhoneLike(args.callRecord.caller) ||
        extractPhoneLike(args.callRecord.user)
      : extractPhoneLike(args.callRecord.to) ||
        extractPhoneLike(args.callRecord.callee) ||
        extractPhoneLike(args.callRecord.user);
  const nextState = inferCallStateFromWebhook({
    eventName,
    statusName,
    direction,
    hasOffer: sessionSdpType === 'offer',
    hasAnswer: sessionSdpType === 'answer',
  });
  const endedAt = isTerminalCallState(nextState) ? new Date().toISOString() : undefined;
  const connectedAt = nextState === 'ongoing' ? new Date().toISOString() : undefined;

  const sessionRecord = await upsertCallSession({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    callId,
    contactWaId: contactWaId || undefined,
    contactName:
      normalizeOptionalString(args.callRecord.contact_name) ||
      normalizeOptionalString(args.callRecord.contactName) ||
      args.fallbackContactName ||
      undefined,
    displayPhone: contactWaId || undefined,
    direction,
    state: nextState,
    startedAt: startedAt || undefined,
    connectedAt,
    endedAt,
    offerSdp: sessionSdpType === 'offer' ? sessionSdp : undefined,
    answerSdp: sessionSdpType === 'answer' ? sessionSdp : undefined,
    bizOpaqueCallbackData:
      normalizeOptionalString(args.callRecord.biz_opaque_callback_data) ||
      normalizeOptionalString(args.callRecord.bizOpaqueCallbackData) ||
      undefined,
    lastEvent: eventName || statusName || undefined,
    raw: args.callRecord,
  });

  await syncCallLogFromSession(args.userId, sessionRecord);

  if (isTerminalCallState(sessionRecord.state)) {
    await maybeCreateMissedCallNotification(sessionRecord, args.userId);
    await upsertCallSummaryMessage({
      userId: args.userId,
      metaChannelId: args.metaChannelId,
      session: sessionRecord,
    });
  }

  return sessionRecord;
}

async function handleCallWebhookStatus(args: {
  userId: string;
  metaChannelId: string;
  statusRecord: Record<string, unknown>;
}) {
  const explicitType = normalizeOptionalString(args.statusRecord.type);

  if (explicitType && explicitType !== 'call') {
    return null;
  }

  const callId =
    normalizeOptionalString(args.statusRecord.call_id) ||
    (explicitType === 'call' ? normalizeOptionalString(args.statusRecord.id) : null);

  if (!callId) {
    return null;
  }

  const nextState = normalizeCallState(
    args.statusRecord.status || args.statusRecord.event || args.statusRecord.call_status,
    'connecting',
  );
  const contactWaId =
    extractPhoneLike(args.statusRecord.from) ||
    extractPhoneLike(args.statusRecord.to) ||
    extractPhoneLike(args.statusRecord.user);
  const direction = normalizeCallDirection(
    args.statusRecord.direction || args.statusRecord.call_direction || args.statusRecord.initiated_by,
  );
  const connectedAt = nextState === 'ongoing' ? new Date().toISOString() : undefined;
  const sessionRecord = await upsertCallSession({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    callId,
    contactWaId: contactWaId || undefined,
    displayPhone: contactWaId || undefined,
    direction,
    state: nextState || 'connecting',
    connectedAt,
    endedAt: isTerminalCallState(nextState || 'connecting') ? new Date().toISOString() : undefined,
    lastEvent:
      normalizeOptionalString(args.statusRecord.event) ||
      normalizeOptionalString(args.statusRecord.status) ||
      undefined,
    raw: args.statusRecord,
  });

  await syncCallLogFromSession(args.userId, sessionRecord);

  if (isTerminalCallState(sessionRecord.state)) {
    await maybeCreateMissedCallNotification(sessionRecord, args.userId);
    await upsertCallSummaryMessage({
      userId: args.userId,
      metaChannelId: args.metaChannelId,
      session: sessionRecord,
    });
  }

  return sessionRecord;
}

function mapBusinessProfile(
  raw: Record<string, unknown>,
  channelRow: Record<string, unknown>,
  phoneSnapshot?: {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    whatsapp_business_manager_messaging_limit?: string;
    messaging_limit_tier?: string;
    name_status?: string;
  },
  officialBusinessAccountStatus?: WhatsAppOfficialBusinessAccountStatus | null,
): WhatsAppBusinessProfile {
  return {
    about: normalizeOptionalString(raw.about),
    address: normalizeOptionalString(raw.address),
    description: normalizeOptionalString(raw.description),
    displayNameStatus: normalizeOptionalString(phoneSnapshot?.name_status),
    displayNameRequest: getStoredDisplayNameRequest(channelRow.metadata),
    twoStepVerification: mapStoredTwoStepVerificationStatus(channelRow.metadata),
    officialBusinessAccountStatus: officialBusinessAccountStatus || null,
    email: normalizeOptionalString(raw.email),
    profilePictureUrl: normalizeOptionalString(raw.profile_picture_url),
    websites: Array.isArray(raw.websites)
      ? (raw.websites as unknown[])
          .map((website) => (typeof website === 'string' ? website : ''))
          .filter(Boolean)
      : [],
    vertical: normalizeOptionalString(raw.vertical),
    displayPhoneNumber:
      normalizeOptionalString(phoneSnapshot?.display_phone_number) ||
      normalizeOptionalString(channelRow.display_phone_number),
    verifiedName:
      normalizeOptionalString(phoneSnapshot?.verified_name) ||
      normalizeOptionalString(channelRow.verified_name),
    qualityRating:
      normalizeOptionalString(phoneSnapshot?.quality_rating) ||
      normalizeOptionalString(channelRow.quality_rating),
    messagingLimitTier: getNormalizedMessagingLimitTier(phoneSnapshot) || normalizeOptionalString(channelRow.messaging_limit_tier),
    businessAccountName: normalizeOptionalString(channelRow.business_account_name),
    phoneNumberId: String(channelRow.phone_number_id),
    wabaId: String(channelRow.waba_id),
  };
}

function mapCommerceSettings(
  raw: Record<string, unknown>,
  channelRow: Record<string, unknown>,
): WhatsAppCommerceSettings {
  return {
    id: normalizeOptionalIdentifier(raw.id),
    phoneNumberId: String(channelRow.phone_number_id),
    isCartEnabled: typeof raw.is_cart_enabled === 'boolean' ? raw.is_cart_enabled : false,
    isCatalogVisible: typeof raw.is_catalog_visible === 'boolean' ? raw.is_catalog_visible : false,
  };
}

function getDefaultConversationalAutomationConfig(args: {
  userId: string;
  channelRow?: Record<string, unknown> | null;
}): WhatsAppConversationalAutomationConfig {
  const now = new Date().toISOString();

  return {
    userId: args.userId,
    metaChannelId: args.channelRow ? String(args.channelRow.id) : null,
    phoneNumberId: args.channelRow ? String(args.channelRow.phone_number_id) : null,
    enableWelcomeMessage: false,
    prompts: [],
    commands: [],
    lastSyncedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mapConversationalAutomationConfig(
  row: Record<string, unknown> | null,
  args: {
    userId: string;
    channelRow?: Record<string, unknown> | null;
  },
): WhatsAppConversationalAutomationConfig {
  const defaults = getDefaultConversationalAutomationConfig(args);

  if (!row) {
    return defaults;
  }

  return {
    userId: String(row.user_id || defaults.userId),
    metaChannelId: args.channelRow ? String(args.channelRow.id) : normalizeOptionalString(row.meta_channel_id),
    phoneNumberId: args.channelRow
      ? String(args.channelRow.phone_number_id)
      : normalizeOptionalString(row.phone_number_id),
    enableWelcomeMessage: Boolean(row.enable_welcome_message),
    prompts: Array.isArray(row.prompts)
      ? row.prompts
          .map((prompt) => normalizeConversationalAutomationPrompt(prompt))
          .filter((prompt): prompt is string => Boolean(prompt))
      : [],
    commands: normalizeConversationalAutomationCommands(row.commands),
    lastSyncedAt: normalizeOptionalString(row.last_synced_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at || defaults.createdAt),
    updatedAt: String(row.updated_at || defaults.updatedAt),
  };
}

function mapAutomationRule(row: Record<string, unknown>): AutomationRule {
  const action = normalizeAutomationRuleAction(row.action);
  const filters =
    normalizeAutomationRuleFilters(action.filters) ||
    buildLegacyAutomationFilterGroup(String(row.keyword || ''), normalizeAutomationRuleMatchMode(row.keyword_match_mode));

  return {
    id: String(row.id),
    userId: String(row.user_id),
    metaChannelId: normalizeOptionalString(row.meta_channel_id),
    name: String(row.name || 'Untitled rule'),
    isEnabled: Boolean(row.is_enabled),
    triggerType: normalizeAutomationRuleTriggerType(row.trigger_type),
    keyword: String(row.keyword || ''),
    keywordMatchMode: normalizeAutomationRuleMatchMode(row.keyword_match_mode),
    filters,
    action: {
      ...action,
      filters,
    },
    lastTriggeredAt: normalizeOptionalString(row.last_triggered_at),
    triggerCount: Number(row.trigger_count || 0),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function shouldReplaceMessengerContactName(row: Record<string, unknown>, senderId: string) {
  const currentName = normalizeOptionalString(row.contact_name);

  if (!currentName) {
    return true;
  }

  const nameDigits = normalizePhoneLike(currentName);

  return (
    nameDigits === senderId ||
    currentName === `+${senderId}` ||
    currentName.toLowerCase() === `messenger:${senderId}` ||
    looksLikeMessengerPsid(currentName)
  );
}

function getMessengerProfileEnrichmentMetadata(row: Record<string, unknown>) {
  const attributes = isRecord(row.attributes) ? (row.attributes as Record<string, unknown>) : {};
  const metadata = isRecord(attributes.messengerProfileEnrichment)
    ? (attributes.messengerProfileEnrichment as Record<string, unknown>)
    : null;

  return {
    attributes,
    metadata,
  };
}

function shouldSkipMessengerProfileEnrichment(row: Record<string, unknown>) {
  if (!normalizeOptionalString(row.avatar_url)) {
    return false;
  }

  const { metadata } = getMessengerProfileEnrichmentMetadata(row);

  if (metadata?.status !== 'unavailable') {
    return false;
  }

  const failedAt = normalizeOptionalString(metadata.failedAt);

  if (!failedAt) {
    return false;
  }

  const failedAtMs = Date.parse(failedAt);

  if (!Number.isFinite(failedAtMs)) {
    return false;
  }

  return Date.now() - failedAtMs < MESSENGER_PROFILE_ENRICHMENT_RETRY_COOLDOWN_MS;
}

async function enrichMessengerThreadProfiles(
  userId: string,
  threadRows: Record<string, unknown>[],
  messengerChannelRow: Record<string, unknown> | null,
) {
  if (!messengerChannelRow || threadRows.length === 0) {
    return false;
  }

  const pageAccessTokenCiphertext = normalizeOptionalString(messengerChannelRow.page_access_token_ciphertext);

  if (!pageAccessTokenCiphertext) {
    return false;
  }

  let accessToken: string;

  try {
    accessToken = decryptAccessToken(pageAccessTokenCiphertext);
  } catch (error) {
    console.error('Failed to decrypt Messenger page access token for profile enrichment:', error);
    return false;
  }

  const targets = threadRows
    .map((row) => ({
      row,
      senderId: getMessengerSenderIdFromThreadRow(row),
    }))
    .filter((entry): entry is { row: Record<string, unknown>; senderId: string } => {
      if (!entry.senderId) {
        return false;
      }

      if (shouldSkipMessengerProfileEnrichment(entry.row)) {
        return false;
      }

      const source = getThreadSource(entry.row);
      const displayPhone = normalizeOptionalString(entry.row.display_phone);
      return (
        shouldReplaceMessengerContactName(entry.row, entry.senderId) ||
        !normalizeOptionalString(entry.row.avatar_url) ||
        source !== 'messenger' ||
        !displayPhone ||
        displayPhone === `+${entry.senderId}` ||
        looksLikeMessengerPsid(displayPhone)
      );
    })
    .slice(0, 25);

  let changed = false;

  for (const { row, senderId } of targets) {
    let profile: Awaited<ReturnType<typeof fetchMessengerUserProfile>> | null = null;
    let profileError: string | null = null;

    try {
      profile = await fetchMessengerUserProfile(accessToken, senderId);
    } catch (error) {
      profileError = mapDbError(error);
      console.warn(`Messenger profile unavailable for ${senderId}: ${profileError}`);
    }

    const shouldReplaceName = shouldReplaceMessengerContactName(row, senderId);
    const { attributes } = getMessengerProfileEnrichmentMetadata(row);
    const payload: Record<string, unknown> = {
      source: 'Messenger',
      username: profile?.name || normalizeOptionalString(row.username) || null,
      display_phone: senderId,
      attributes: {
        ...attributes,
        messengerProfileEnrichment: profileError
          ? {
              status: 'unavailable',
              failedAt: new Date().toISOString(),
              lastError: profileError,
            }
          : {
              status: 'ok',
              enrichedAt: new Date().toISOString(),
              lastError: null,
            },
      },
      updated_at: new Date().toISOString(),
    };

    if (profile?.name && shouldReplaceName) {
      payload.contact_name = profile.name;
    }

    if (profile?.profilePictureUrl) {
      payload.avatar_url = profile.profilePictureUrl;
    }

    const { error } = await adminSupabase
      .from('conversation_threads')
      .update(payload)
      .eq('user_id', userId)
      .eq('id', String(row.id));

    if (error) {
      console.error('Failed to update Messenger thread profile:', error);
      continue;
    }

    if (profile?.name && shouldReplaceName) {
      const { error: messageUpdateError } = await adminSupabase
        .from('conversation_messages')
        .update({
          sender_name: profile.name,
        })
        .eq('user_id', userId)
        .eq('thread_id', String(row.id))
        .eq('direction', 'inbound')
        .is('sender_name', null);

      if (messageUpdateError) {
        console.error('Failed to update Messenger message sender names:', messageUpdateError);
      }
    }

    changed = true;
  }

  return changed;
}

function getMessengerConversationCustomer(
  conversation: MessengerPageConversation,
  pageId: string,
) {
  const participants = Array.isArray(conversation.participants?.data)
    ? conversation.participants.data
    : [];

  return (
    participants.find((participant) => {
      const participantId = normalizeOptionalIdentifier(participant.id);
      return Boolean(participantId && participantId !== pageId);
    }) || null
  );
}

function getMessengerConversationMessageDirection(
  message: MessengerPageConversationMessage,
  pageId: string,
): ConversationMessage['direction'] {
  return normalizeOptionalIdentifier(message.from?.id) === pageId ? 'outbound' : 'inbound';
}

async function syncMessengerPageConversations(args: {
  userId: string;
  pageId: string;
  pageName: string | null;
  pageAccessToken: string;
}) {
  const conversations = await fetchMessengerPageConversations(args.pageAccessToken, args.pageId);
  let syncedThreads = 0;
  let syncedMessages = 0;

  for (const conversation of conversations) {
    const customer = getMessengerConversationCustomer(conversation, args.pageId);
    const customerId = normalizeOptionalIdentifier(customer?.id);

    if (!customerId) {
      continue;
    }

    const messages = (Array.isArray(conversation.messages?.data) ? conversation.messages.data : [])
      .filter((message) => normalizeOptionalString(message.id) || normalizeOptionalString(message.message))
      .sort((left, right) => {
        const leftTime = Date.parse(left.created_time || '');
        const rightTime = Date.parse(right.created_time || '');

        if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
          return 0;
        }

        return leftTime - rightTime;
      });
    const latestMessage = messages[messages.length - 1] || null;
    let profile: Awaited<ReturnType<typeof fetchMessengerUserProfile>> | null = null;

    try {
      profile = await fetchMessengerUserProfile(args.pageAccessToken, customerId);
    } catch (error) {
      console.error('Failed to fetch Messenger conversation profile:', error);
    }

    const contactName =
      profile?.name ||
      normalizeOptionalString(customer?.name) ||
      null;
    const profilePictureUrl = profile?.profilePictureUrl || null;
    const latestMessageBody =
      normalizeOptionalString(latestMessage?.message) ||
      (messages.length > 0 ? 'Messenger conversation' : null);
    const latestMessageAt =
      toIsoTimestamp(latestMessage?.created_time || null) ||
      new Date().toISOString();

    const thread = await upsertThread({
      userId: args.userId,
      metaChannelId: null,
      contactWaId: getMessengerThreadIdentity(customerId),
      contactName,
      username: contactName,
      displayPhone: customerId,
      source: 'Messenger',
      remark: latestMessageBody,
      avatarUrl: profilePictureUrl,
      lastMessageText: latestMessageBody,
      lastMessageAt: latestMessageAt,
      unreadDelta: 0,
    });
    syncedThreads += 1;

    for (const message of messages) {
      const messageId = normalizeOptionalString(message.id);
      const body = normalizeOptionalString(message.message);

      if (!messageId || !body) {
        continue;
      }

      const existingMessageResult = await adminSupabase
        .from('conversation_messages')
        .select('id')
        .eq('user_id', args.userId)
        .eq('wa_message_id', messageId)
        .maybeSingle();

      if (existingMessageResult.error) {
        throw existingMessageResult.error;
      }

      if (existingMessageResult.data) {
        continue;
      }

      const direction = getMessengerConversationMessageDirection(message, args.pageId);

      await insertMessage({
        userId: args.userId,
        threadId: thread.id,
        waMessageId: messageId,
        direction,
        messageType: 'text',
        body,
        senderName: direction === 'inbound' ? contactName : args.pageName,
        senderWaId: getMessengerThreadIdentity(direction === 'inbound' ? customerId : args.pageId),
        recipientWaId: getMessengerThreadIdentity(direction === 'inbound' ? args.pageId : customerId),
        status: direction === 'inbound' ? 'received' : 'sent',
        raw: {
          source: 'messenger',
          sync_source: 'page_conversations',
          conversation_id: normalizeOptionalIdentifier(conversation.id),
          ...message,
          sender_profile: profile,
        },
      });
      syncedMessages += 1;
    }
  }

  return {
    syncedThreads,
    syncedMessages,
  };
}

function shouldReplaceInstagramContactName(row: Record<string, unknown>, senderId: string) {
  const currentName = normalizeOptionalString(row.contact_name);

  if (!currentName) {
    return true;
  }

  const normalizedName = currentName.toLowerCase();

  return (
    currentName === senderId ||
    normalizedName === `instagram:${senderId}` ||
    normalizedName.startsWith('@')
  );
}

async function enrichInstagramThreadProfiles(
  userId: string,
  threadRows: Record<string, unknown>[],
  instagramChannelRow: Record<string, unknown> | null,
) {
  if (!instagramChannelRow || threadRows.length === 0) {
    return false;
  }

  const targets = threadRows
    .map((row) => ({
      row,
      senderId: getInstagramSenderIdFromThreadRow(row),
    }))
    .filter((entry): entry is { row: Record<string, unknown>; senderId: string } => {
      if (!entry.senderId) {
        return false;
      }

      return (
        shouldReplaceInstagramContactName(entry.row, entry.senderId) ||
        !normalizeOptionalString(entry.row.avatar_url) ||
        getThreadSource(entry.row) !== 'instagram'
      );
    })
    .slice(0, 25);

  let changed = false;

  for (const { row, senderId } of targets) {
    let profile: Awaited<ReturnType<typeof fetchInstagramMessagingUserProfileForChannel>> | null = null;

    try {
      profile = await fetchInstagramMessagingUserProfileForChannel(instagramChannelRow, senderId);
    } catch (error) {
      console.error('Failed to enrich Instagram thread profile:', error);
    }

    if (!profile?.name && !profile?.username && !profile?.profilePictureUrl) {
      continue;
    }

    const shouldReplaceName = shouldReplaceInstagramContactName(row, senderId);
    const displayHandle = profile.username ? `@${profile.username}` : null;
    const payload: Record<string, unknown> = {
      source: 'Instagram',
      username: displayHandle || profile.name || normalizeOptionalString(row.username) || null,
      display_phone: displayHandle || normalizeOptionalString(row.display_phone) || senderId,
      updated_at: new Date().toISOString(),
    };

    if (profile.name && shouldReplaceName) {
      payload.contact_name = profile.name;
    }

    if (profile.profilePictureUrl) {
      payload.avatar_url = profile.profilePictureUrl;
    }

    const { error } = await adminSupabase
      .from('conversation_threads')
      .update(payload)
      .eq('user_id', userId)
      .eq('id', String(row.id));

    if (error) {
      console.error('Failed to update Instagram thread profile:', error);
      continue;
    }

    if (profile.name && shouldReplaceName) {
      const { error: messageUpdateError } = await adminSupabase
        .from('conversation_messages')
        .update({
          sender_name: profile.name,
        })
        .eq('user_id', userId)
        .eq('thread_id', String(row.id))
        .eq('direction', 'inbound')
        .is('sender_name', null);

      if (messageUpdateError) {
        console.error('Failed to update Instagram message sender names:', messageUpdateError);
      }
    }

    changed = true;
  }

  return changed;
}

async function getBootstrap(user: User): Promise<DashboardBootstrap> {
  const [
    profileResult,
    channelResult,
    instagramChannelResult,
    messengerChannelResult,
    adsIntegrationResult,
    templatesResult,
    threadsResult,
    notificationsResult,
    notificationPreferencesResult,
    callHistoryResult,
    callSessionsResult,
    wallet,
  ] =
    await Promise.all([
      adminSupabase.from('app_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('meta_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('instagram_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('messenger_channels').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('meta_ads_integrations').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('meta_templates').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      adminSupabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false }),
      adminSupabase.from('user_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      adminSupabase.from('user_notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      adminSupabase.from('call_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      adminSupabase.from('call_sessions').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20),
      getWalletForUser(user),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (channelResult.error) throw channelResult.error;
  if (instagramChannelResult.error && !isMissingSchemaError(instagramChannelResult.error)) {
    throw instagramChannelResult.error;
  }
  if (messengerChannelResult.error && !isMissingSchemaError(messengerChannelResult.error)) {
    throw messengerChannelResult.error;
  }
  if (adsIntegrationResult.error && !isMissingSchemaError(adsIntegrationResult.error)) {
    throw adsIntegrationResult.error;
  }
  if (templatesResult.error) throw templatesResult.error;
  if (threadsResult.error) throw threadsResult.error;
  if (notificationsResult.error && !isMissingSchemaError(notificationsResult.error)) {
    throw notificationsResult.error;
  }
  if (notificationPreferencesResult.error && !isMissingSchemaError(notificationPreferencesResult.error)) {
    throw notificationPreferencesResult.error;
  }
  if (callHistoryResult.error) throw callHistoryResult.error;
  if (callSessionsResult.error) throw callSessionsResult.error;

  const mappedProfile = mapProfile(profileResult.data as Record<string, unknown> | null);
  let threadRows = ((threadsResult.data || []) as Record<string, unknown>[]) || [];

  if (threadRows.length > 0) {
    const changed = await ensureConversationThreadPhoneConsistency(user.id, threadRows);

    if (changed) {
      const refreshedThreadsResult = await adminSupabase
        .from('conversation_threads')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (refreshedThreadsResult.error) {
        throw refreshedThreadsResult.error;
      }

      threadRows = (refreshedThreadsResult.data || []) as Record<string, unknown>[];
    }
  }

  const connectedInstagramChannelRow = getConnectedChannelRow(
    (instagramChannelResult.data as Record<string, unknown> | null) || null,
  );
  const connectedMessengerChannelRow = getConnectedChannelRow(
    (messengerChannelResult.data as Record<string, unknown> | null) || null,
  );

  const messengerProfilesChanged = await enrichMessengerThreadProfiles(
    user.id,
    threadRows,
    connectedMessengerChannelRow,
  );
  const instagramProfilesChanged = await enrichInstagramThreadProfiles(
    user.id,
    threadRows,
    connectedInstagramChannelRow,
  );

  if (messengerProfilesChanged || instagramProfilesChanged) {
    const refreshedThreadsResult = await adminSupabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (refreshedThreadsResult.error) {
      throw refreshedThreadsResult.error;
    }

    threadRows = (refreshedThreadsResult.data || []) as Record<string, unknown>[];
  }

  return {
    profile: mappedProfile
      ? {
          ...mappedProfile,
          email: user.email || mappedProfile.email,
        }
      : null,
    channel: mapChannel(channelResult.data as Record<string, unknown> | null),
    instagramChannel: mapInstagramChannel(connectedInstagramChannelRow),
    messengerChannel: mapMessengerChannel(connectedMessengerChannelRow),
    adsIntegration: mapMetaAdsIntegration(
      adsIntegrationResult.data as Record<string, unknown> | null,
    ),
    templates: (templatesResult.data || []).map((row) => mapTemplate(row as Record<string, unknown>)),
    conversations: threadRows.map((row) => mapThread(row)),
    notifications: (notificationsResult.data || []).map((row) =>
      mapNotification(row as Record<string, unknown>),
    ),
    notificationPreferences: mapNotificationPreferences(
      notificationPreferencesResult.data as Record<string, unknown> | null,
      user.id,
    ),
    wallet,
    callHistory: (callHistoryResult.data || []).map((row) => mapCall(row as Record<string, unknown>)),
    callSessions: (callSessionsResult.data || []).map((row) => mapCallSession(row as Record<string, unknown>)),
  };
}

async function getNotificationPreferencesForUser(userId: string) {
  const { data, error } = await adminSupabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return mapNotificationPreferences((data as Record<string, unknown> | null) || null, userId);
}

async function saveNotificationPreferences(
  userId: string,
  input: NotificationPreferencesUpdateInput,
) {
  const current = await getNotificationPreferencesForUser(userId);
  const payload = {
    user_id: userId,
    enabled: input.enabled ?? current.enabled,
    sound_enabled: input.soundEnabled ?? current.soundEnabled,
    call_sound_enabled: input.callSoundEnabled ?? current.callSoundEnabled,
    sound_preset: normalizeNotificationSoundPreset(input.soundPreset ?? current.soundPreset),
    volume: normalizeNotificationVolume(input.volume ?? current.volume, current.volume),
    incoming_message_enabled: input.incomingMessageEnabled ?? current.incomingMessageEnabled,
    incoming_email_enabled: input.incomingEmailEnabled ?? current.incomingEmailEnabled,
    template_review_enabled: input.templateReviewEnabled ?? current.templateReviewEnabled,
    missed_call_enabled: input.missedCallEnabled ?? current.missedCallEnabled,
    lead_enabled: input.leadEnabled ?? current.leadEnabled,
    campaign_sent_enabled: input.campaignSentEnabled ?? current.campaignSentEnabled,
    email_campaign_enabled: input.emailCampaignEnabled ?? current.emailCampaignEnabled,
    display_name_approved_enabled:
      input.displayNameApprovedEnabled ?? current.displayNameApprovedEnabled,
    team_joined_enabled: input.teamJoinedEnabled ?? current.teamJoinedEnabled,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('user_notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapNotificationPreferences(data as Record<string, unknown>, userId);
}

function mapDeveloperApiCredential(row: Record<string, unknown>): DeveloperApiCredential {
  const scopes = Array.isArray(row.scopes)
    ? row.scopes.filter((scope): scope is DeveloperApiScope => {
        return typeof scope === 'string' && developerApiScopeSet.has(scope);
      })
    : [];

  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: normalizeOptionalString(row.name) || 'REST API key',
    apiKey: String(row.api_key || ''),
    secretLast4: String(row.secret_last4 || ''),
    scopes: scopes.length > 0 ? scopes : [...DEVELOPER_API_SCOPES],
    status: row.status === 'revoked' ? 'revoked' : 'active',
    lastUsedAt: normalizeOptionalString(row.last_used_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDeveloperWebhookEndpoint(row: Record<string, unknown>): DeveloperWebhookEndpoint {
  const events = Array.isArray(row.events)
    ? row.events.filter((event): event is DeveloperWebhookEvent => {
        return typeof event === 'string' && developerWebhookEventSet.has(event);
      })
    : [];

  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: normalizeOptionalString(row.name) || 'Webhook endpoint',
    url: String(row.url || ''),
    events,
    status: row.status === 'paused' ? 'paused' : 'active',
    signingSecretLast4: String(row.signing_secret_last4 || ''),
    lastDeliveryAt: normalizeOptionalString(row.last_delivery_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function dispatchDeveloperWebhookEvent(
  userId: string,
  eventName: DeveloperWebhookEvent,
  data: Record<string, unknown>,
) {
  const endpointsResult = await adminSupabase
    .from('developer_webhook_endpoints')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .contains('events', [eventName]);

  if (endpointsResult.error) {
    if (isMissingSchemaError(endpointsResult.error)) {
      return;
    }

    throw endpointsResult.error;
  }

  const endpoints = ((endpointsResult.data || []) as Record<string, unknown>[])
    .map((row) => ({
      row,
      endpoint: mapDeveloperWebhookEndpoint(row),
      signingSecret: normalizeOptionalString(row.signing_secret_ciphertext)
        ? decryptSecretValue(String(row.signing_secret_ciphertext))
        : null,
    }))
    .filter((entry) => entry.signingSecret);

  if (endpoints.length === 0) {
    return;
  }

  for (const { endpoint, signingSecret } of endpoints) {
    const deliveryId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const body = JSON.stringify({
      id: deliveryId,
      event: eventName,
      createdAt,
      data,
    });
    const signature = crypto
      .createHmac('sha256', signingSecret!)
      .update(body)
      .digest('hex');

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Connektly-Delivery': deliveryId,
          'X-Connektly-Event': eventName,
          'X-Connektly-Signature': `sha256=${signature}`,
        },
        body,
      });

      const deliveryPayload = response.ok
        ? {
            last_delivery_at: new Date().toISOString(),
            last_error: null,
          }
        : {
            last_delivery_at: new Date().toISOString(),
            last_error: `HTTP ${response.status}`,
          };

      await adminSupabase
        .from('developer_webhook_endpoints')
        .update(deliveryPayload)
        .eq('user_id', userId)
        .eq('id', endpoint.id);
    } catch (error) {
      await adminSupabase
        .from('developer_webhook_endpoints')
        .update({
          last_delivery_at: new Date().toISOString(),
          last_error: error instanceof Error ? error.message : 'Webhook delivery failed.',
        })
        .eq('user_id', userId)
        .eq('id', endpoint.id);
    }
  }
}

async function listDeveloperApiCredentials(userId: string) {
  const { data, error } = await adminSupabase
    .from('developer_api_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as Record<string, unknown>[]).map((row) => mapDeveloperApiCredential(row));
}

async function createDeveloperApiCredential(userId: string, input: DeveloperApiCredentialCreateInput) {
  const secret = generateDeveloperToken('cnkt_secret', 32);
  const apiKey = generateDeveloperToken('cnkt_live', 18);
  const name = (normalizeOptionalString(input?.name) || 'REST API key').slice(0, 100);
  const scopes = normalizeDeveloperApiScopes(input?.scopes);

  const { data, error } = await adminSupabase
    .from('developer_api_credentials')
    .insert({
      user_id: userId,
      name,
      api_key: apiKey,
      secret_hash: hashDeveloperSecret(secret),
      secret_last4: last4(secret),
      scopes,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    credential: mapDeveloperApiCredential(data as Record<string, unknown>),
    secret,
  };
}

async function regenerateDeveloperApiCredentialSecret(userId: string, credentialId: string) {
  const id = normalizeOptionalIdentifier(credentialId);

  if (!id) {
    throw new Error('API credential ID is required.');
  }

  const secret = generateDeveloperToken('cnkt_secret', 32);
  const { data, error } = await adminSupabase
    .from('developer_api_credentials')
    .update({
      secret_hash: hashDeveloperSecret(secret),
      secret_last4: last4(secret),
      status: 'active',
    })
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('API credential was not found.');
  }

  return {
    credential: mapDeveloperApiCredential(data as Record<string, unknown>),
    secret,
  };
}

async function deleteDeveloperApiCredential(userId: string, credentialId: string) {
  const id = normalizeOptionalIdentifier(credentialId);

  if (!id) {
    throw new Error('API credential ID is required.');
  }

  const { error } = await adminSupabase
    .from('developer_api_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    throw error;
  }

  return { ok: true };
}

async function listDeveloperWebhooks(userId: string) {
  const { data, error } = await adminSupabase
    .from('developer_webhook_endpoints')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as Record<string, unknown>[]).map((row) => mapDeveloperWebhookEndpoint(row));
}

async function createDeveloperWebhook(userId: string, input: DeveloperWebhookCreateInput) {
  const signingSecret = generateDeveloperToken('whsec', 32);
  const name = (normalizeOptionalString(input?.name) || 'Webhook endpoint').slice(0, 100);
  const url = normalizeDeveloperWebhookUrl(input?.url);
  const events = normalizeDeveloperWebhookEvents(input?.events);

  const { data, error } = await adminSupabase
    .from('developer_webhook_endpoints')
    .insert({
      user_id: userId,
      name,
      url,
      events,
      status: 'active',
      signing_secret_ciphertext: encryptSecretValue(signingSecret),
      signing_secret_last4: last4(signingSecret),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    webhook: mapDeveloperWebhookEndpoint(data as Record<string, unknown>),
    signingSecret,
  };
}

async function updateDeveloperWebhook(
  userId: string,
  webhookId: string,
  input: DeveloperWebhookUpdateInput,
) {
  const id = normalizeOptionalIdentifier(webhookId);

  if (!id) {
    throw new Error('Webhook ID is required.');
  }

  const payload: Record<string, unknown> = {};

  if ('name' in input) {
    payload.name = (normalizeOptionalString(input.name) || 'Webhook endpoint').slice(0, 100);
  }

  if ('url' in input) {
    payload.url = normalizeDeveloperWebhookUrl(input.url);
  }

  if ('events' in input) {
    payload.events = normalizeDeveloperWebhookEvents(input.events);
  }

  if ('status' in input) {
    payload.status = normalizeDeveloperWebhookStatus(input.status, 'active');
  }

  const { data, error } = await adminSupabase
    .from('developer_webhook_endpoints')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Webhook endpoint was not found.');
  }

  return mapDeveloperWebhookEndpoint(data as Record<string, unknown>);
}

async function deleteDeveloperWebhook(userId: string, webhookId: string) {
  const id = normalizeOptionalIdentifier(webhookId);

  if (!id) {
    throw new Error('Webhook ID is required.');
  }

  const { error } = await adminSupabase
    .from('developer_webhook_endpoints')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    throw error;
  }

  return { ok: true };
}

function normalizeWooCommerceStoreUrl(value: unknown) {
  const rawUrl = normalizeOptionalString(value);

  if (!rawUrl) {
    throw new Error('WooCommerce store URL is required.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('Enter a valid WooCommerce store URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('WooCommerce store URL must use HTTP or HTTPS.');
  }

  parsedUrl.hash = '';
  parsedUrl.search = '';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');

  return parsedUrl.toString().replace(/\/$/, '');
}

function normalizeWooCommerceAutomationSettings(value: unknown): WooCommerceAutomationSetting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const settingsById = new Map<WooCommerceAutomationId, WooCommerceAutomationSetting>();

  for (const entry of value) {
    if (!isRecord(entry) || !woocommerceAutomationIdSet.has(String(entry.id))) {
      continue;
    }

    const id = String(entry.id) as WooCommerceAutomationId;
    const sendAfterMinutes = Number(entry.sendAfterMinutes);
    settingsById.set(id, {
      id,
      enabled: Boolean(entry.enabled),
      templateKey: normalizeOptionalString(entry.templateKey) || '',
      sendAfterMinutes:
        Number.isFinite(sendAfterMinutes) && sendAfterMinutes >= 0
          ? Math.trunc(sendAfterMinutes)
          : 0,
    });
  }

  return WOOCOMMERCE_AUTOMATION_IDS.map(
    (id) =>
      settingsById.get(id) || {
        id,
        enabled: false,
        templateKey: '',
        sendAfterMinutes:
          id === 'abandoned-recovery'
            ? 30
            : id === 'purchase-follow-up'
              ? 1440
              : 0,
      },
  );
}

function mapWooCommerceConnection(row: Record<string, unknown> | null): WooCommerceConnection | null {
  if (!row) {
    return null;
  }

  const status =
    row.status === 'error' || row.status === 'disconnected'
      ? row.status
      : 'connected';

  return {
    userId: String(row.user_id),
    storeName: normalizeOptionalString(row.store_name),
    storeUrl: String(row.store_url || ''),
    consumerKeyLast4: String(row.consumer_key_last4 || ''),
    consumerSecretLast4: String(row.consumer_secret_last4 || ''),
    webhookSecretLast4: String(row.webhook_secret_last4 || ''),
    status,
    automations: normalizeWooCommerceAutomationSettings(row.automations),
    lastVerifiedAt: normalizeOptionalString(row.last_verified_at),
    lastError: normalizeOptionalString(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getWooCommerceBasicAuthHeader(consumerKey: string, consumerSecret: string) {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;
}

async function verifyWooCommerceConnectionInput(input: WooCommerceConnectionVerifyInput) {
  const storeUrl = normalizeWooCommerceStoreUrl(input.storeUrl);
  const consumerKey = normalizeOptionalString(input.consumerKey);
  const consumerSecret = normalizeOptionalString(input.consumerSecret);

  if (!consumerKey || !consumerSecret) {
    throw new Error('WooCommerce consumer key and consumer secret are required.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${storeUrl}/wp-json/wc/v3/system_status`, {
      headers: {
        Authorization: getWooCommerceBasicAuthHeader(consumerKey, consumerSecret),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `WooCommerce verification failed with status ${response.status}.`;

      try {
        const payload = await response.json();
        if (isRecord(payload)) {
          message =
            normalizeOptionalString(payload.message) ||
            normalizeOptionalString(payload.error) ||
            message;
        }
      } catch {
        // Keep the HTTP status fallback.
      }

      throw new Error(message);
    }

    const payload = await response.json().catch(() => null);
    const environment = isRecord(payload) && isRecord(payload.environment)
      ? (payload.environment as Record<string, unknown>)
      : null;

    return {
      ok: true,
      storeName:
        normalizeOptionalString(environment?.site_title) ||
        normalizeOptionalString(environment?.home_url) ||
        null,
      storeUrl,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getWooCommerceConnection(userId: string) {
  const { data, error } = await adminSupabase
    .from('woocommerce_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return mapWooCommerceConnection((data as Record<string, unknown> | null) || null);
}

async function saveWooCommerceConnection(userId: string, input: WooCommerceConnectionInput) {
  const verification = await verifyWooCommerceConnectionInput(input);
  const consumerKey = normalizeOptionalString(input.consumerKey);
  const consumerSecret = normalizeOptionalString(input.consumerSecret);

  if (!consumerKey || !consumerSecret) {
    throw new Error('WooCommerce consumer key and consumer secret are required.');
  }

  const currentResult = await adminSupabase
    .from('woocommerce_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (currentResult.error && !isMissingSchemaError(currentResult.error)) {
    throw currentResult.error;
  }

  const existingWebhookSecret = normalizeOptionalString(currentResult.data?.webhook_secret_ciphertext)
    ? decryptSecretValue(String(currentResult.data?.webhook_secret_ciphertext))
    : null;
  const webhookSecret = existingWebhookSecret || generateDeveloperToken('woo_whsec', 24);
  const payload = {
    user_id: userId,
    store_name: verification.storeName,
    store_url: verification.storeUrl,
    consumer_key_ciphertext: encryptSecretValue(consumerKey),
    consumer_key_last4: last4(consumerKey),
    consumer_secret_ciphertext: encryptSecretValue(consumerSecret),
    consumer_secret_last4: last4(consumerSecret),
    webhook_secret_ciphertext: encryptSecretValue(webhookSecret),
    webhook_secret_last4: last4(webhookSecret),
    status: 'connected',
    automations: normalizeWooCommerceAutomationSettings(input.automations),
    last_verified_at: new Date().toISOString(),
    last_error: null,
  };

  const { data, error } = await adminSupabase
    .from('woocommerce_connections')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    connection: mapWooCommerceConnection(data as Record<string, unknown>),
    webhookSecret: existingWebhookSecret ? undefined : webhookSecret,
  };
}

async function updateWooCommerceAutomations(userId: string, automations: WooCommerceAutomationSetting[]) {
  const { data, error } = await adminSupabase
    .from('woocommerce_connections')
    .update({
      automations: normalizeWooCommerceAutomationSettings(automations),
    })
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Connect WooCommerce before saving automated messages.');
  }

  return mapWooCommerceConnection(data as Record<string, unknown>);
}

async function createUserNotification(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetPath?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
}) {
  const preferences = await getNotificationPreferencesForUser(args.userId);

  if (!shouldCreateNotification(preferences, args.type)) {
    return null;
  }

  const dedupeKey = normalizeOptionalString(args.dedupeKey);
  const metadata = args.metadata || {};

  if (dedupeKey) {
    const existing = await adminSupabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', args.userId)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existing.error && !isMissingSchemaError(existing.error)) {
      throw existing.error;
    }

    if (existing.data) {
      return mapNotification(existing.data as Record<string, unknown>);
    }
  }

  const notificationPayload = {
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    target_path: normalizeOptionalString(args.targetPath) || null,
    metadata,
    dedupe_key: dedupeKey,
  };
  const insertNotification = (payload: typeof notificationPayload) =>
    adminSupabase
      .from('user_notifications')
      .insert(payload)
      .select('*')
      .single();
  let { data, error } = await insertNotification(notificationPayload);

  if (error) {
    const rawErrorMessage =
      isRecord(error) && typeof error.message === 'string'
        ? error.message
        : '';
    const rawErrorDetails =
      isRecord(error) && typeof error.details === 'string'
        ? error.details
        : '';
    const isLegacyTypeConstraint =
      isRecord(error) &&
      error.code === '23514' &&
      (rawErrorMessage.includes('user_notifications_type_check') ||
        rawErrorDetails.includes('user_notifications_type_check'));

    if (!isLegacyTypeConstraint) {
      throw error;
    }

    const fallbackResult = await insertNotification({
      ...notificationPayload,
      type: 'lead_created',
      metadata: {
        ...metadata,
        originalType: args.type,
      },
    });

    data = fallbackResult.data;
    error = fallbackResult.error;

    if (error) {
      throw error;
    }
  }

  return mapNotification(data as Record<string, unknown>);
}

function getDisplayNameStatus(value: unknown) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function getStoredDisplayNameApprovalStatus(metadata: unknown) {
  if (!isRecord(metadata) || !isRecord(metadata.displayNameApproval)) {
    return null;
  }

  return getDisplayNameStatus((metadata.displayNameApproval as Record<string, unknown>).status);
}

function getStoredDisplayNameRequest(metadata: unknown): WhatsAppDisplayNameRequest | null {
  if (!isRecord(metadata) || !isRecord(metadata.displayNameRequest)) {
    return null;
  }

  const request = metadata.displayNameRequest as Record<string, unknown>;
  const requestedName = normalizeOptionalString(request.requestedName);
  const requestedAt = normalizeOptionalString(request.requestedAt);

  if (!requestedName || !requestedAt) {
    return null;
  }

  return {
    requestedName,
    requestedAt,
    status: getDisplayNameStatus(request.status),
    lastError: normalizeOptionalString(request.lastError),
  };
}

async function createIncomingMessageNotification(args: {
  userId: string;
  source: 'WhatsApp' | 'Messenger' | 'Instagram';
  messageId: string | null;
  contactName?: string | null;
  contactValue?: string | null;
  previewText: string;
  threadId?: string | null;
}) {
  const messageId = normalizeOptionalString(args.messageId);

  if (!messageId) {
    return null;
  }

  const senderLabel =
    normalizeOptionalString(args.contactName) ||
    normalizeOptionalString(args.contactValue) ||
    `${args.source} contact`;

  return createUserNotification({
    userId: args.userId,
    type: 'incoming_message',
    title: `New ${args.source} message`,
    body: `${senderLabel}: ${args.previewText}`,
    targetPath: '/dashboard/inbox',
    metadata: {
      source: args.source,
      messageId,
      threadId: normalizeOptionalString(args.threadId) || null,
      sender: senderLabel,
    },
    dedupeKey: `incoming-message:${args.source.toLowerCase()}:${messageId}`,
  });
}

const LIVE_EMAIL_NOTIFICATION_WINDOW_MS = 30 * 60 * 1000;

async function syncIncomingEmailNotifications(userId: string, messages: EmailMessage[]) {
  const now = Date.now();

  for (const message of messages) {
    if (!message.isUnread) {
      continue;
    }

    const receivedAt = normalizeOptionalString(message.receivedAt);
    const receivedAtTimestamp = receivedAt ? Date.parse(receivedAt) : Number.NaN;

    if (
      !Number.isFinite(receivedAtTimestamp) ||
      now - receivedAtTimestamp > LIVE_EMAIL_NOTIFICATION_WINDOW_MS
    ) {
      continue;
    }

    const senderLabel =
      normalizeOptionalString(message.fromName) ||
      normalizeOptionalString(message.fromEmail) ||
      'New sender';

    await createUserNotification({
      userId,
      type: 'incoming_email',
      title: `New email from ${senderLabel}`,
      body: message.subject ? `${message.subject} - ${message.previewText}` : message.previewText,
      targetPath: '/dashboard/inbox/email',
      metadata: {
        emailId: message.id,
        fromEmail: normalizeOptionalString(message.fromEmail),
        fromName: normalizeOptionalString(message.fromName),
        receivedAt,
      },
      dedupeKey: `incoming-email:${message.id}`,
    });
  }
}

async function markNotificationsRead(userId: string, options: { notificationId?: string | null; markAll?: boolean }) {
  let query = adminSupabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (!options.markAll) {
    const notificationId = normalizeOptionalString(options.notificationId);

    if (!notificationId) {
      throw new Error('notificationId is required unless markAll is true.');
    }

    query = query.eq('id', notificationId);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function getInboxInsights(
  userId: string,
  query: Record<string, unknown>,
): Promise<InboxInsightsResponse> {
  const channel = normalizeInsightsChannel(query.channel);
  const { startDate, endDate, startAtIso, endExclusiveIso } = resolveInsightsDateRange(
    query.startDate,
    query.endDate,
  );
  const isChannelSupported = channel === 'all' || channel === 'whatsapp';
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  let rows: InsightsMessageRow[] = [];

  if (isChannelSupported) {
    const messagesResult = await adminSupabase
      .from('conversation_messages')
      .select('thread_id,direction,status,recipient_wa_id,created_at')
      .eq('user_id', userId)
      .gte('created_at', startAtIso)
      .lt('created_at', endExclusiveIso)
      .order('thread_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (messagesResult.error) {
      throw messagesResult.error;
    }

    rows = (messagesResult.data || []) as InsightsMessageRow[];
  }

  const outboundRows = rows.filter((row) => row.direction === 'outbound');
  const inboundRows = rows.filter((row) => row.direction === 'inbound');
  const deliveredCount = outboundRows.filter((row) => row.status === 'delivered' || row.status === 'read').length;
  const readCount = outboundRows.filter((row) => row.status === 'read').length;
  const failedCount = outboundRows.filter((row) => row.status === 'failed').length;
  const repliedCount = countRepliedOutboundMessages(rows);
  const uniqueOutboundRecipients = new Set(
    outboundRows
      .map((row) => normalizePhoneLike(row.recipient_wa_id) || (row.thread_id ? `thread:${row.thread_id}` : null))
      .filter(Boolean),
  ).size;
  const channelRow = channelResult.data as Record<string, unknown> | null;
  let messagingLimitTier = normalizeOptionalString(channelRow?.messaging_limit_tier);
  let messagingQuality = normalizeOptionalString(channelRow?.quality_rating);

  if (channelRow?.phone_number_id) {
    try {
      const { row, accessToken } = await getChannelWithToken(userId);
      const phoneSnapshot = await fetchPhoneNumber(accessToken, String(row.phone_number_id));
      const nextMessagingLimitTier = getNormalizedMessagingLimitTier(phoneSnapshot) || messagingLimitTier;
      const nextMessagingQuality = normalizeOptionalString(phoneSnapshot.quality_rating) || messagingQuality;

      messagingLimitTier = nextMessagingLimitTier;
      messagingQuality = nextMessagingQuality;

      if (
        nextMessagingLimitTier !== normalizeOptionalString(channelRow.messaging_limit_tier) ||
        nextMessagingQuality !== normalizeOptionalString(channelRow.quality_rating)
      ) {
        await adminSupabase
          .from('meta_channels')
          .update({
            messaging_limit_tier: nextMessagingLimitTier,
            quality_rating: nextMessagingQuality,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('id', row.id);
      }
    } catch {
      // Keep insights available even when the live Meta fetch fails temporarily.
    }
  }

  return {
    filters: {
      startDate,
      endDate,
      channel,
    },
    isChannelSupported,
    lastUpdatedAt: new Date().toISOString(),
    messagingLimit: {
      consumed: uniqueOutboundRecipients,
      total: getMessagingLimitCapacity(messagingLimitTier),
      tier: messagingLimitTier,
    },
    messagingQuality,
    totals: {
      sent: outboundRows.length,
      delivered: deliveredCount,
      received: inboundRows.length,
    },
    outcomes: {
      read: readCount,
      replied: repliedCount,
      failed: failedCount,
    },
  };
}

function resolveMetaLeadCaptureStatus(args: {
  pageIds: string[];
  hasAccessToken: boolean;
  lastError?: string | null;
}): MetaLeadCaptureConfig['status'] {
  if (args.lastError) {
    return 'error';
  }

  return args.pageIds.length > 0 && args.hasAccessToken ? 'ready' : 'draft';
}

async function seedMetaLeadCaptureFromReusableSetup(args: {
  userId: string;
  metaChannelId: string | null;
  accessToken: string;
  reusableAssets: ReusableMetaSetupAssets;
}) {
  const reusablePageIds = Array.from(
    new Set(args.reusableAssets.pages.map((page) => page.pageId).filter(Boolean)),
  );

  if (!reusablePageIds.length && !metaAppId) {
    return;
  }

  const existing = await ensureMetaLeadCaptureConfig(args.userId, args.metaChannelId);
  const existingPageIds = normalizeStringArray(existing.page_ids);
  const existingAccessToken = normalizeOptionalString(existing.access_token_ciphertext);
  const existingAppId = normalizeOptionalIdentifier(existing.app_id);
  const shouldUseReusablePages = existingPageIds.length === 0 && reusablePageIds.length > 0;
  const shouldUseReusableToken = !existingAccessToken && reusablePageIds.length > 0;
  const shouldUseReusableApp = !existingAppId && Boolean(metaAppId);

  if (!shouldUseReusablePages && !shouldUseReusableToken && !shouldUseReusableApp) {
    return;
  }

  const nextPageIds = shouldUseReusablePages ? reusablePageIds : existingPageIds;
  const nextAccessTokenCiphertext = shouldUseReusableToken
    ? encryptAccessToken(args.accessToken)
    : existingAccessToken;
  const nextAccessTokenLast4 = shouldUseReusableToken
    ? last4(args.accessToken)
    : normalizeOptionalString(existing.access_token_last4);
  const nextLastError =
    shouldUseReusablePages || shouldUseReusableToken
      ? null
      : normalizeOptionalString(existing.last_error);
  const status = resolveMetaLeadCaptureStatus({
    pageIds: nextPageIds,
    hasAccessToken: Boolean(nextAccessTokenCiphertext),
    lastError: nextLastError,
  });

  const { error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .upsert(
      {
        user_id: args.userId,
        meta_channel_id: args.metaChannelId || normalizeOptionalString(existing.meta_channel_id),
        status,
        app_id: shouldUseReusableApp ? metaAppId : existingAppId,
        page_ids: nextPageIds,
        form_ids: normalizeStringArray(existing.form_ids),
        access_token_ciphertext: nextAccessTokenCiphertext,
        access_token_last4: nextAccessTokenLast4,
        verify_token: normalizeOptionalString(existing.verify_token) || generateVerifyToken(),
        default_owner_name: normalizeOptionalString(existing.default_owner_name),
        default_labels: normalizeStringArray(existing.default_labels),
        auto_create_leads: Boolean(existing.auto_create_leads),
        last_error: nextLastError,
      },
      {
        onConflict: 'user_id',
      },
    );

  if (error) {
    throw error;
  }
}

async function ensureMetaLeadCaptureConfig(userId: string, metaChannelId: string | null) {
  const existingResult = await adminSupabase
    .from('meta_lead_capture_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (existingResult.data) {
    if (!existingResult.data.meta_channel_id && metaChannelId) {
      const { data, error } = await adminSupabase
        .from('meta_lead_capture_configs')
        .update({
          meta_channel_id: metaChannelId,
        })
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data as Record<string, unknown>;
    }

    return existingResult.data as Record<string, unknown>;
  }

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .insert({
      user_id: userId,
      meta_channel_id: metaChannelId,
      verify_token: generateVerifyToken(),
      default_labels: ['meta lead'],
      auto_create_leads: true,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function getMetaLeadCaptureSetup(
  userId: string,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const configRow = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  return buildMetaLeadCaptureSetupResponse(userId, req, configRow);
}

async function fetchMetaLeadCapturePageSubscription(
  accessToken: string,
  pageId: string,
  appId: string | null,
): Promise<MetaLeadCapturePageSubscription> {
  try {
    const response = await metaRequest<{
      data?: Array<Record<string, unknown>>;
    }>({
      accessToken,
      path: `${pageId}/subscribed_apps`,
      query: {
        fields: 'id,name,subscribed_fields',
      },
    });

    const apps = Array.isArray(response.data)
      ? response.data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
      : [];
    const normalizedAppId = normalizeOptionalIdentifier(appId);
    const exactApp =
      (normalizedAppId
        ? apps.find((entry) => normalizeOptionalIdentifier(entry.id) === normalizedAppId) || null
        : null);
    const leadgenApp =
      apps.find((entry) => normalizeMetaSubscribedFields(entry.subscribed_fields).includes('leadgen')) || null;
    const matchedApp = exactApp || leadgenApp;
    const matchedFields = matchedApp ? normalizeMetaSubscribedFields(matchedApp.subscribed_fields) : [];
    const subscribed = Boolean(leadgenApp);
    const mismatchMessage =
      normalizedAppId &&
      leadgenApp &&
      normalizeOptionalIdentifier(leadgenApp.id) !== normalizedAppId
        ? `Leadgen is active on this Page, but the subscribed app ID (${normalizeOptionalIdentifier(leadgenApp.id) || 'unknown'}) does not match the saved Meta App ID (${normalizedAppId}).`
        : null;

    return {
      pageId,
      appId: matchedApp ? normalizeOptionalIdentifier(matchedApp.id) : normalizedAppId,
      appName: matchedApp ? normalizeOptionalString(matchedApp.name) : null,
      subscribed,
      subscribedFields: matchedFields,
      errorMessage: mismatchMessage,
    };
  } catch (error) {
    return {
      pageId,
      appId: normalizeOptionalIdentifier(appId),
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage: mapDbError(error),
    };
  }
}

async function getMetaLeadCapturePageSubscriptions(configRow: Record<string, unknown>) {
  const pageIds = normalizeStringArray(configRow.page_ids);

  if (!pageIds.length) {
    return [] satisfies MetaLeadCapturePageSubscription[];
  }

  const encryptedAccessToken = normalizeOptionalString(configRow.access_token_ciphertext);
  const appId = normalizeOptionalIdentifier(configRow.app_id);

  if (!encryptedAccessToken) {
    return pageIds.map((pageId) => ({
      pageId,
      appId,
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage: 'Save a Page access token to check Page subscriptions.',
    }));
  }

  let accessToken = '';

  try {
    accessToken = decryptAccessToken(encryptedAccessToken);
  } catch (error) {
    const errorMessage = mapDbError(error);
    return pageIds.map((pageId) => ({
      pageId,
      appId,
      appName: null,
      subscribed: false,
      subscribedFields: [],
      errorMessage,
    }));
  }

  return Promise.all(
    pageIds.map((pageId) => fetchMetaLeadCapturePageSubscription(accessToken, pageId, appId)),
  );
}

async function buildMetaLeadCaptureSetupResponse(
  userId: string,
  req: Request,
  configRow: Record<string, unknown>,
): Promise<MetaLeadCaptureSetupResponse> {
  const [eventsResult, pageSubscriptions] = await Promise.all([
    adminSupabase
      .from('meta_lead_capture_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12),
    getMetaLeadCapturePageSubscriptions(configRow),
  ]);

  if (eventsResult.error) {
    throw eventsResult.error;
  }

  const callbackUrl = getMetaLeadCaptureCallbackUrl(req);

  return {
    config: mapMetaLeadCaptureConfig(configRow, callbackUrl),
    recentEvents: (eventsResult.data || []).map((row) =>
      mapMetaLeadCaptureEvent(row as Record<string, unknown>),
    ),
    pageSubscriptions,
  };
}

async function connectMetaLeadCaptureSetup(
  userId: string,
  input: MetaLeadCaptureConnectionInput,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const flowState = normalizeMetaOAuthFlowState(input.flowState);

  if (flowState !== 'lead_capture_flow') {
    throw new Error('Lead Capture OAuth state is required for this connection.');
  }

  const accessToken = normalizeOptionalString(input.accessToken);

  if (!accessToken) {
    throw new Error('Facebook access token is required.');
  }

  const [channelResult, reusableAssets] = await Promise.all([
    adminSupabase
      .from('meta_channels')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
    fetchReusableMetaSetupAssets(accessToken),
  ]);

  if (channelResult.error) {
    throw channelResult.error;
  }

  if (!reusableAssets.pages.length) {
    throw new Error(
      reusableAssets.collectionError ||
        'No Facebook Pages were returned. Confirm the user granted Pages and Leads permissions.',
    );
  }

  const requestedPageIds = normalizeStringArray(input.pageIds);
  const requestedPageIdSet = new Set(requestedPageIds);
  const matchedPages = requestedPageIds.length
    ? reusableAssets.pages.filter((page) => requestedPageIdSet.has(page.pageId))
    : reusableAssets.pages;

  if (!matchedPages.length) {
    throw new Error('The selected Facebook Page was not returned by Meta for this login.');
  }

  const primaryPage =
    matchedPages.find((page) => normalizeOptionalString(page.pageAccessToken)) ||
    matchedPages[0];

  if (!primaryPage?.pageId) {
    throw new Error('Meta did not return a usable Facebook Page for this login.');
  }

  const selectedPages = requestedPageIds.length ? matchedPages : [primaryPage];
  const selectedPageIds = selectedPages.map((page) => page.pageId);
  const durableAccessToken = normalizeOptionalString(primaryPage.pageAccessToken) || accessToken;
  const subscriptionFailures: string[] = [];

  for (const page of selectedPages) {
    const pageAccessToken = normalizeOptionalString(page.pageAccessToken) || durableAccessToken;

    try {
      await subscribeMetaLeadCapturePage(pageAccessToken, page.pageId);
    } catch (error) {
      subscriptionFailures.push(`${page.pageId}: ${mapDbError(error)}`);
    }
  }

  const existing = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  const nextLastError = subscriptionFailures.length ? subscriptionFailures.join(' | ') : null;
  const status = resolveMetaLeadCaptureStatus({
    pageIds: selectedPageIds,
    hasAccessToken: Boolean(durableAccessToken),
    lastError: nextLastError,
  });

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .upsert(
      {
        user_id: userId,
        meta_channel_id: channelResult.data
          ? String(channelResult.data.id)
          : normalizeOptionalString(existing.meta_channel_id),
        status,
        app_id: metaAppId || normalizeOptionalIdentifier(existing.app_id) || null,
        page_ids: selectedPageIds,
        form_ids: normalizeStringArray(existing.form_ids),
        access_token_ciphertext: encryptAccessToken(durableAccessToken),
        access_token_last4: last4(durableAccessToken),
        verify_token: normalizeOptionalString(existing.verify_token) || generateVerifyToken(),
        default_owner_name: normalizeOptionalString(existing.default_owner_name),
        default_labels: normalizeStringArray(existing.default_labels).length
          ? normalizeStringArray(existing.default_labels)
          : ['meta lead'],
        auto_create_leads: Boolean(existing.auto_create_leads ?? true),
        last_error: nextLastError,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return buildMetaLeadCaptureSetupResponse(userId, req, data as Record<string, unknown>);
}

async function saveMetaLeadCaptureSetup(
  userId: string,
  input: MetaLeadCaptureSetupInput,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const existing = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  const nextAccessToken = normalizeOptionalString(input.accessToken);
  const nextPageIds = input.pageIds !== undefined ? normalizeStringArray(input.pageIds) : normalizeStringArray(existing.page_ids);
  const nextFormIds = input.formIds !== undefined ? normalizeStringArray(input.formIds) : normalizeStringArray(existing.form_ids);
  const nextDefaultLabels =
    input.defaultLabels !== undefined ? normalizeStringArray(input.defaultLabels) : normalizeStringArray(existing.default_labels);
  const nextVerifyToken =
    input.regenerateVerifyToken || !normalizeOptionalString(existing.verify_token)
      ? generateVerifyToken()
      : String(existing.verify_token);
  const accessTokenCiphertext =
    input.accessToken !== undefined
      ? nextAccessToken
        ? encryptAccessToken(nextAccessToken)
        : null
      : normalizeOptionalString(existing.access_token_ciphertext);
  const accessTokenLast4 =
    input.accessToken !== undefined
      ? nextAccessToken
        ? last4(nextAccessToken)
        : null
      : normalizeOptionalString(existing.access_token_last4);
  const nextLastError = input.accessToken !== undefined || input.pageIds !== undefined ? null : normalizeOptionalString(existing.last_error);
  const status = resolveMetaLeadCaptureStatus({
    pageIds: nextPageIds,
    hasAccessToken: Boolean(accessTokenCiphertext),
    lastError: nextLastError,
  });

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .upsert(
      {
        user_id: userId,
        meta_channel_id: channelResult.data ? String(channelResult.data.id) : normalizeOptionalString(existing.meta_channel_id),
        status,
        app_id:
          'appId' in input
            ? normalizeOptionalString(input.appId)
            : normalizeOptionalString(existing.app_id),
        page_ids: nextPageIds,
        form_ids: nextFormIds,
        access_token_ciphertext: accessTokenCiphertext,
        access_token_last4: accessTokenLast4,
        verify_token: nextVerifyToken,
        default_owner_name:
          'defaultOwnerName' in input
            ? normalizeOptionalString(input.defaultOwnerName)
            : normalizeOptionalString(existing.default_owner_name),
        default_labels: nextDefaultLabels,
        auto_create_leads:
          input.autoCreateLeads !== undefined
            ? Boolean(input.autoCreateLeads)
            : Boolean(existing.auto_create_leads),
        last_error: nextLastError,
      },
      {
        onConflict: 'user_id',
      },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return buildMetaLeadCaptureSetupResponse(userId, req, data as Record<string, unknown>);
}

async function subscribeMetaLeadCapturePage(accessToken: string, pageId: string) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps`);
  url.searchParams.set('subscribed_fields', 'leadgen');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    let payload: {
      error?: {
        message?: string;
        error_user_msg?: string;
        code?: number;
      };
    } | null = null;

    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = null;
    }

    throw buildMetaApiError(response, payload);
  }

  return (await response.json()) as { success?: boolean };
}

async function activateMetaLeadCapturePageSubscriptions(
  userId: string,
  req: Request,
): Promise<MetaLeadCaptureSetupResponse> {
  const channelResult = await adminSupabase
    .from('meta_channels')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (channelResult.error) {
    throw channelResult.error;
  }

  const configRow = await ensureMetaLeadCaptureConfig(
    userId,
    channelResult.data ? String(channelResult.data.id) : null,
  );
  const pageIds = normalizeStringArray(configRow.page_ids);

  if (!pageIds.length) {
    throw new Error('Add at least one Page ID before activating Page subscriptions.');
  }

  const encryptedAccessToken = normalizeOptionalString(configRow.access_token_ciphertext);

  if (!encryptedAccessToken) {
    throw new Error('Save a Page access token before activating Page subscriptions.');
  }

  const accessToken = decryptAccessToken(encryptedAccessToken);
  const failures: string[] = [];

  for (const pageId of pageIds) {
    try {
      await subscribeMetaLeadCapturePage(accessToken, pageId);
    } catch (error) {
      failures.push(`${pageId}: ${mapDbError(error)}`);
    }
  }

  const nextLastError = failures.length ? failures.join(' | ') : null;
  const { data, error } = await adminSupabase
    .from('meta_lead_capture_configs')
    .update({
      status: resolveMetaLeadCaptureStatus({
        pageIds,
        hasAccessToken: true,
        lastError: nextLastError,
      }),
      last_error: nextLastError,
    })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return buildMetaLeadCaptureSetupResponse(userId, req, data as Record<string, unknown>);
}

async function fetchMetaLeadCaptureLead(accessToken: string, leadId: string) {
  return metaRequest<{
    id?: string;
    created_time?: string;
    field_data?: Array<{
      name?: string;
      values?: unknown[];
    }>;
    form_id?: string;
    is_organic?: boolean;
    platform?: string;
  }>({
    accessToken,
    path: leadId,
    query: {
      fields: 'id,created_time,field_data,form_id,is_organic,platform',
    },
  });
}

function getMetaLeadCaptureFieldMap(fieldData: unknown) {
  if (!Array.isArray(fieldData)) {
    return {} as Record<string, string[]>;
  }

  return fieldData.reduce<Record<string, string[]>>((accumulator, entry) => {
    if (!isRecord(entry)) {
      return accumulator;
    }

    const name = normalizeOptionalString(entry.name)?.toLowerCase();
    const values = Array.isArray(entry.values)
      ? entry.values
          .map((value) => normalizeOptionalString(value))
          .filter((value): value is string => Boolean(value))
      : [];

    if (!name || values.length === 0) {
      return accumulator;
    }

    accumulator[name] = values;
    return accumulator;
  }, {});
}

function getMetaLeadCaptureFieldValue(
  fieldMap: Record<string, string[]>,
  candidates: string[],
) {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    const value = fieldMap[normalizedCandidate]?.[0];

    if (value) {
      return value;
    }
  }

  return null;
}

async function upsertMetaLeadCaptureEvent(args: {
  userId: string;
  pageId: string | null;
  formId: string | null;
  leadId: string | null;
  eventTime: string | null;
  processingStatus: MetaLeadCaptureEvent['processingStatus'];
  errorMessage?: string | null;
  raw: Record<string, unknown>;
}) {
  if (args.leadId) {
    const existing = await adminSupabase
      .from('meta_lead_capture_events')
      .select('*')
      .eq('user_id', args.userId)
      .eq('lead_id', args.leadId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      const { data, error } = await adminSupabase
        .from('meta_lead_capture_events')
        .update({
          page_id: args.pageId,
          form_id: args.formId,
          event_time: args.eventTime,
          processing_status: args.processingStatus,
          error_message: args.errorMessage || null,
          raw: args.raw,
        })
        .eq('id', existing.data.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data as Record<string, unknown>;
    }
  }

  const { data, error } = await adminSupabase
    .from('meta_lead_capture_events')
    .insert({
      user_id: args.userId,
      page_id: args.pageId,
      form_id: args.formId,
      lead_id: args.leadId,
      event_time: args.eventTime,
      processing_status: args.processingStatus,
      error_message: args.errorMessage || null,
      raw: args.raw,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function processMetaLeadCaptureChange(change: Record<string, unknown>, pageIdFallback: string | null) {
  if (normalizeOptionalString(change.field) !== 'leadgen') {
    return;
  }

  const value = isRecord(change.value) ? change.value : {};
  const pageId = normalizeOptionalIdentifier(value.page_id) || pageIdFallback;
  const formId = normalizeOptionalIdentifier(value.form_id);
  const leadId = normalizeOptionalIdentifier(value.leadgen_id) || normalizeOptionalIdentifier(value.lead_id);
  const eventTime =
    toIsoTimestamp(
      typeof value.created_time === 'string' || typeof value.created_time === 'number'
        ? value.created_time
        : null,
    ) || new Date().toISOString();

  if (!pageId) {
    return;
  }

  const configResult = await adminSupabase
    .from('meta_lead_capture_configs')
    .select('*')
    .contains('page_ids', [pageId])
    .limit(1)
    .maybeSingle();

  if (configResult.error) {
    throw configResult.error;
  }

  if (!configResult.data) {
    return;
  }

  const config = configResult.data as Record<string, unknown>;
  const userId = String(config.user_id);
  const configLabels = normalizeStringArray(config.default_labels);

  await adminSupabase
    .from('meta_lead_capture_configs')
    .update({
      last_webhook_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('user_id', userId);

  await upsertMetaLeadCaptureEvent({
    userId,
    pageId,
    formId,
    leadId,
    eventTime,
    processingStatus: 'received',
    raw: change,
  });

  const configuredFormIds = normalizeStringArray(config.form_ids);

  if (configuredFormIds.length > 0 && (!formId || !configuredFormIds.includes(formId))) {
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'skipped',
      errorMessage: 'This form is not enabled in the Meta Lead Capture setup.',
      raw: change,
    });
    return;
  }

  if (!Boolean(config.auto_create_leads)) {
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'skipped',
      errorMessage: 'Auto-create leads is turned off for this integration.',
      raw: change,
    });
    return;
  }

  if (!leadId) {
    const message = 'Meta did not include a leadgen_id in the webhook payload.';
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });
    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
    return;
  }

  const encryptedAccessToken = normalizeOptionalString(config.access_token_ciphertext);

  if (!encryptedAccessToken) {
    const message = 'No Meta Page access token is saved for lead retrieval.';
    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });
    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
    return;
  }

  try {
    const lead = await fetchMetaLeadCaptureLead(decryptAccessToken(encryptedAccessToken), leadId);
    const fieldMap = getMetaLeadCaptureFieldMap(lead.field_data);
    const firstName = getMetaLeadCaptureFieldValue(fieldMap, ['first_name']);
    const lastName = getMetaLeadCaptureFieldValue(fieldMap, ['last_name']);
    const fullName =
      getMetaLeadCaptureFieldValue(fieldMap, ['full_name', 'full name', 'name']) ||
      [firstName, lastName].filter(Boolean).join(' ') ||
      'Meta lead';
    const phone =
      normalizePhoneLike(
        getMetaLeadCaptureFieldValue(fieldMap, [
          'phone_number',
          'phone',
          'phone number',
          'work_phone_number',
          'mobile_phone_number',
        ]),
      ) || null;
    const email = normalizeOptionalString(
      getMetaLeadCaptureFieldValue(fieldMap, ['email', 'email_address']),
    );
    const contactIdentity = phone || email || `meta-lead:${leadId}`;
    const displayPhone = phone || email || `Lead ${leadId.slice(-6)}`;
    const previewText = `New Meta lead${formId ? ` from form ${formId}` : ''}`;
    const leadLabels = Array.from(new Set(['meta lead', ...configLabels]));
    const leadMessageId = `meta-lead:${leadId}`;
    const existingLeadMessage = await adminSupabase
      .from('conversation_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('wa_message_id', leadMessageId)
      .maybeSingle();

    if (existingLeadMessage.error) {
      throw existingLeadMessage.error;
    }

    const thread = await upsertThread({
      userId,
      metaChannelId: normalizeOptionalString(config.meta_channel_id),
      contactWaId: contactIdentity,
      contactName: fullName,
      displayPhone,
      email,
      source: 'Meta',
      remark: previewText,
      status: 'New Lead',
      priority: 'Medium',
      labels: leadLabels,
      ownerName: normalizeOptionalString(config.default_owner_name),
      lastMessageText: previewText,
      lastMessageAt: eventTime,
      unreadDelta: existingLeadMessage.data ? 0 : 1,
    });

    await insertMessage({
      userId,
      threadId: thread.id,
      waMessageId: leadMessageId,
      direction: 'inbound',
      messageType: 'lead_capture',
      body: previewText,
      senderName: fullName,
      senderWaId: contactIdentity,
      status: 'delivered',
      raw: {
        lead_capture: {
          lead_id: leadId,
          page_id: pageId,
          form_id: formId || normalizeOptionalIdentifier(lead.form_id),
          created_time: normalizeOptionalString(lead.created_time) || eventTime,
          is_organic: Boolean(lead.is_organic),
          platform: normalizeOptionalString(lead.platform),
          field_data: fieldMap,
        },
      },
    });

    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'processed',
      raw: change,
    });

    await createUserNotification({
      userId,
      type: 'lead_created',
      title: 'New lead added to CRM',
      body: `${fullName} was added to your lead list from Meta Lead Capture.`,
      targetPath: '/dashboard/crm/leads',
      metadata: {
        leadId,
        pageId,
        formId,
        source: 'Meta',
        threadId: thread.id,
        contactName: fullName,
        phone: phone || null,
        email,
      },
      dedupeKey: `lead-created:${leadId}`,
    });

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: resolveMetaLeadCaptureStatus({
          pageIds: normalizeStringArray(config.page_ids),
          hasAccessToken: true,
          lastError: null,
        }),
        last_error: null,
        last_lead_synced_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } catch (error) {
    const message = mapDbError(error);

    await upsertMetaLeadCaptureEvent({
      userId,
      pageId,
      formId,
      leadId,
      eventTime,
      processingStatus: 'error',
      errorMessage: message,
      raw: change,
    });

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        status: 'error',
        last_error: message,
      })
      .eq('user_id', userId);
  }
}

async function upsertProfile(user: User, input: ProfileUpsertInput) {
  const existing = await adminSupabase
    .from('app_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const previousProfilePictureUrl = normalizeOptionalString(existing.data?.profile_picture_url);
  const previousCompanyLogoUrl = normalizeOptionalString(existing.data?.company_logo_url);
  const nextProfilePictureUrl =
    'profilePictureUrl' in input
      ? normalizeOptionalString(input.profilePictureUrl)
      : previousProfilePictureUrl;
  const nextCompanyLogoUrl =
    'companyLogoUrl' in input
      ? normalizeOptionalString(input.companyLogoUrl)
      : previousCompanyLogoUrl;

  const payload = {
    user_id: user.id,
    email: user.email || existing.data?.email || null,
    full_name:
      'fullName' in input
        ? normalizeOptionalString(input.fullName)
        : normalizeOptionalString(existing.data?.full_name),
    profile_picture_url: nextProfilePictureUrl,
    company_logo_url: nextCompanyLogoUrl,
    country_code:
      'countryCode' in input
        ? normalizeOptionalString(input.countryCode)
        : normalizeOptionalString(existing.data?.country_code),
    phone:
      'phone' in input ? normalizeOptionalString(input.phone) : normalizeOptionalString(existing.data?.phone),
    preferred_currency:
      'preferredCurrency' in input
        ? (normalizeOptionalString(input.preferredCurrency)
            ? normalizeCurrencyCode(input.preferredCurrency)
            : null)
        : normalizeOptionalString(existing.data?.preferred_currency)
          ? normalizeCurrencyCode(existing.data?.preferred_currency)
          : null,
    company_name:
      'companyName' in input
        ? normalizeOptionalString(input.companyName)
        : normalizeOptionalString(existing.data?.company_name),
    company_website:
      'companyWebsite' in input
        ? normalizeOptionalString(input.companyWebsite)
        : normalizeOptionalString(existing.data?.company_website),
    industry:
      'industry' in input
        ? normalizeOptionalString(input.industry)
        : normalizeOptionalString(existing.data?.industry),
    selected_plan: 'selectedPlan' in input ? input.selectedPlan ?? null : existing.data?.selected_plan ?? null,
    billing_cycle:
      'billingCycle' in input ? input.billingCycle ?? null : (existing.data?.billing_cycle as string | null) ?? null,
    billing_status:
      'billingStatus' in input
        ? input.billingStatus ?? null
        : (existing.data?.billing_status as string | null) ?? null,
    trial_ends_at:
      'trialEndsAt' in input ? input.trialEndsAt ?? null : (existing.data?.trial_ends_at as string | null) ?? null,
    free_trial_started_at:
      'freeTrialStartedAt' in input
        ? input.freeTrialStartedAt ?? null
        : (existing.data?.free_trial_started_at as string | null) ?? null,
    coupon_code: 'couponCode' in input ? input.couponCode ?? null : (existing.data?.coupon_code as string | null) ?? null,
    razorpay_subscription_id:
      'razorpaySubscriptionId' in input
        ? input.razorpaySubscriptionId ?? null
        : (existing.data?.razorpay_subscription_id as string | null) ?? null,
    onboarding_completed:
      'onboardingCompleted' in input ? input.onboardingCompleted ?? false : existing.data?.onboarding_completed ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('app_profiles')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  if ('profilePictureUrl' in input && previousProfilePictureUrl && previousProfilePictureUrl !== nextProfilePictureUrl) {
    await deleteStoredAppProfilePhoto(previousProfilePictureUrl);
  }

  if ('companyLogoUrl' in input && previousCompanyLogoUrl && previousCompanyLogoUrl !== nextCompanyLogoUrl) {
    await deleteStoredAppProfilePhoto(previousCompanyLogoUrl);
  }

  await ensureWalletForUser(
    user.id,
    normalizeOptionalString(payload.preferred_currency) ? String(payload.preferred_currency) : null,
  );

  return mapProfile(data as Record<string, unknown>);
}

async function deleteAccount(user: User) {
  const profileResult = await adminSupabase
    .from('app_profiles')
    .select('profile_picture_url,company_logo_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileResult.error && !isMissingSchemaError(profileResult.error)) {
    throw profileResult.error;
  }

  const membershipResult = await adminSupabase
    .from('workspace_team_members')
    .select('id')
    .eq('member_user_id', user.id);

  if (membershipResult.error && !isMissingSchemaError(membershipResult.error)) {
    throw membershipResult.error;
  }

  const profileRow = profileResult.data as Record<string, unknown> | null;
  const membershipIds = (membershipResult.data || [])
    .map((row) => normalizeOptionalIdentifier((row as Record<string, unknown>).id))
    .filter((value): value is string => Boolean(value));
  const storageUrls = Array.from(
    new Set(
      [
        normalizeOptionalString(profileRow?.profile_picture_url),
        normalizeOptionalString(profileRow?.company_logo_url),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const { error } = await adminSupabase.auth.admin.deleteUser(user.id, false);

  if (error) {
    throw error;
  }

  for (const storageUrl of storageUrls) {
    await deleteStoredAppProfilePhoto(storageUrl).catch((cleanupError) => {
      console.error('Account deletion storage cleanup failed:', cleanupError);
    });
  }

  if (membershipIds.length > 0) {
    try {
      const { error: cleanupError } = await adminSupabase
        .from('workspace_team_members')
        .delete()
        .in('id', membershipIds);

      if (cleanupError && !isMissingSchemaError(cleanupError)) {
        throw cleanupError;
      }
    } catch (cleanupError) {
      console.error('Account deletion membership cleanup failed:', cleanupError);
    }
  }

  return { ok: true as const };
}

async function ensureInvitedProfile(userId: string, email: string, fullName: string) {
  const payload = {
    user_id: userId,
    email,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminSupabase.from('app_profiles').upsert(payload, {
    onConflict: 'user_id',
  });

  if (error) {
    throw error;
  }
}

async function getWorkspaceTeamMembers(user: User) {
  const [profileResult, membersResult] = await Promise.all([
    adminSupabase.from('app_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    adminSupabase
      .from('workspace_team_members')
      .select('*')
      .eq('workspace_owner_user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (membersResult.error) {
    throw membersResult.error;
  }

  const ownerProfile = profileResult.data as Record<string, unknown> | null;
  const memberRows = (membersResult.data || []) as Array<Record<string, unknown>>;
  const memberUserIds = memberRows
    .map((row) => normalizeOptionalIdentifier(row.member_user_id))
    .filter((value): value is string => Boolean(value));
  const profileRowsByUserId = new Map<string, Record<string, unknown>>();

  if (memberUserIds.length > 0) {
    const profilesResult = await adminSupabase
      .from('app_profiles')
      .select('user_id,email,full_name,profile_picture_url')
      .in('user_id', memberUserIds);

    if (profilesResult.error && !isMissingSchemaError(profilesResult.error)) {
      throw profilesResult.error;
    }

    for (const profileRow of profilesResult.data || []) {
      const row = profileRow as Record<string, unknown>;
      const profileUserId = normalizeOptionalIdentifier(row.user_id);

      if (profileUserId) {
        profileRowsByUserId.set(profileUserId, row);
      }
    }
  }

  const ownerEmail = normalizeEmailAddress(user.email || ownerProfile?.email) || user.email || '';
  const ownerName =
    normalizeOptionalString(ownerProfile?.full_name) ||
    normalizeOptionalString(user.user_metadata?.full_name) ||
    normalizeOptionalString(user.user_metadata?.name) ||
    normalizeOptionalString(ownerEmail.split('@')[0]) ||
    'Workspace Owner';

  const ownerRecord: WorkspaceTeamMember = {
    id: `owner-${user.id}`,
    workspaceOwnerUserId: user.id,
    memberUserId: user.id,
    fullName: ownerName,
    email: ownerEmail,
    profilePictureUrl: normalizeOptionalString(ownerProfile?.profile_picture_url),
    role: 'Owner',
    status: 'active',
    invitedAt: String(ownerProfile?.created_at || user.created_at || new Date().toISOString()),
    acceptedAt: String(ownerProfile?.created_at || user.created_at || new Date().toISOString()),
    isOwner: true,
  };

  return [
    ownerRecord,
    ...memberRows.map((row) =>
      mapWorkspaceTeamMember(
        row,
        profileRowsByUserId.get(normalizeOptionalIdentifier(row.member_user_id) || '') || null,
      ),
    ),
  ];
}

async function inviteWorkspaceTeamMember(user: User, input: InviteWorkspaceUserInput) {
  const fullName = normalizeOptionalString(input.fullName);
  const email = normalizeEmailAddress(input.email);
  const role = normalizeWorkspaceUserRole(input.role);

  if (!fullName) {
    throw new Error('A full name is required to invite a user.');
  }

  if (!email) {
    throw new Error('A valid email address is required to invite a user.');
  }

  if (role === 'Owner') {
    throw new Error('Invite a workspace role such as Admin, Manager, or Agent.');
  }

  if (normalizeEmailAddress(user.email) === email) {
    throw new Error('You cannot invite your own workspace email address.');
  }

  const existingMembership = await adminSupabase
    .from('workspace_team_members')
    .select('*')
    .eq('workspace_owner_user_id', user.id)
    .eq('invited_email', email)
    .maybeSingle();

  if (existingMembership.error) {
    throw existingMembership.error;
  }

  if (existingMembership.data) {
    throw new Error('This email address is already part of your workspace team.');
  }

  const redirectTo = `${frontendOrigin.replace(/\/$/, '')}/login`;
  const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: {
        full_name: fullName,
        workspace_role: role,
        workspace_owner_user_id: user.id,
      },
    },
  );

  if (inviteError) {
    throw inviteError;
  }

  if (!inviteData.user?.id) {
    throw new Error('Supabase did not return an invited user record.');
  }

  await ensureInvitedProfile(inviteData.user.id, email, fullName);

  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .insert({
      workspace_owner_user_id: user.id,
      member_user_id: inviteData.user.id,
      invited_by_user_id: user.id,
      invited_email: email,
      full_name: fullName,
      role,
      status: 'invited',
      invite_sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapWorkspaceTeamMember(data as Record<string, unknown>);
}

async function updateWorkspaceTeamMember(
  user: User,
  memberId: string,
  input: UpdateWorkspaceTeamMemberInput,
) {
  const normalizedMemberId = normalizeOptionalIdentifier(memberId);
  const fullName = normalizeOptionalString(input.fullName);
  const role = normalizeWorkspaceUserRole(input.role);

  if (!normalizedMemberId || normalizedMemberId.startsWith('owner-')) {
    throw new Error('Choose a workspace teammate to edit.');
  }

  if (!fullName) {
    throw new Error('A full name is required.');
  }

  if (role === 'Owner') {
    throw new Error('Workspace owner role cannot be assigned here.');
  }

  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .update({
      full_name: fullName,
      role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedMemberId)
    .eq('workspace_owner_user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Workspace user was not found.');
  }

  const row = data as Record<string, unknown>;
  const memberUserId = normalizeOptionalIdentifier(row.member_user_id);
  let profileRow: Record<string, unknown> | null = null;

  if (memberUserId) {
    const profileResult = await adminSupabase
      .from('app_profiles')
      .select('user_id,email,full_name,profile_picture_url')
      .eq('user_id', memberUserId)
      .maybeSingle();

    if (profileResult.error && !isMissingSchemaError(profileResult.error)) {
      throw profileResult.error;
    }

    profileRow = (profileResult.data as Record<string, unknown> | null) || null;
  }

  return mapWorkspaceTeamMember(row, profileRow);
}

async function removeWorkspaceTeamMember(user: User, memberId: string) {
  const normalizedMemberId = normalizeOptionalIdentifier(memberId);

  if (!normalizedMemberId || normalizedMemberId.startsWith('owner-')) {
    throw new Error('Workspace owner cannot be removed from the team.');
  }

  const { data, error } = await adminSupabase
    .from('workspace_team_members')
    .delete()
    .eq('id', normalizedMemberId)
    .eq('workspace_owner_user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Workspace user was not found.');
  }

  return { ok: true as const };
}

function normalizeWorkspaceOptionType(value: unknown): WorkspaceOptionDefinition['type'] {
  return value === 'attribute' ? 'attribute' : 'label';
}

function normalizeWorkspaceOptionValueType(value: unknown) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized === 'number' ||
    normalized === 'date' ||
    normalized === 'boolean' ||
    normalized === 'select'
    ? normalized
    : 'text';
}

function mapWorkspaceOptionDefinition(row: Record<string, unknown>): WorkspaceOptionDefinition {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: normalizeWorkspaceOptionType(row.type),
    name: String(row.name || ''),
    valueType: normalizeWorkspaceOptionValueType(row.value_type),
    options: normalizeStringArray(row.options),
    color: normalizeOptionalString(row.color),
    description: normalizeOptionalString(row.description),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

async function getWorkspaceOptionDefinitions(user: User) {
  const ownerUserId = await resolveWorkspaceOwnerUserId(user.id);
  const { data, error } = await adminSupabase
    .from('workspace_option_definitions')
    .select('*')
    .eq('user_id', ownerUserId)
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data || []) as Array<Record<string, unknown>>).map(mapWorkspaceOptionDefinition);
}

async function createWorkspaceOptionDefinition(user: User, input: WorkspaceOptionInput) {
  const ownerUserId = await resolveWorkspaceOwnerUserId(user.id);
  const type = normalizeWorkspaceOptionType(input.type);
  const name = normalizeOptionalString(input.name);

  if (!name) {
    throw new Error(type === 'label' ? 'Enter a label name.' : 'Enter an attribute name.');
  }

  const { data, error } = await adminSupabase
    .from('workspace_option_definitions')
    .insert({
      user_id: ownerUserId,
      type,
      name,
      value_type: type === 'attribute' ? normalizeWorkspaceOptionValueType(input.valueType) : 'text',
      options: type === 'attribute' ? normalizeStringArray(input.options) : [],
      color: normalizeOptionalString(input.color),
      description: normalizeOptionalString(input.description),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapWorkspaceOptionDefinition(data as Record<string, unknown>);
}

async function deleteWorkspaceOptionDefinition(user: User, optionId: string) {
  const ownerUserId = await resolveWorkspaceOwnerUserId(user.id);
  const normalizedOptionId = normalizeOptionalIdentifier(optionId);

  if (!normalizedOptionId) {
    throw new Error('Choose an option to delete.');
  }

  const { data, error } = await adminSupabase
    .from('workspace_option_definitions')
    .delete()
    .eq('id', normalizedOptionId)
    .eq('user_id', ownerUserId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Workspace option was not found.');
  }

  return { ok: true as const };
}

async function getChannelWithToken(userId: string) {
  const { data, error } = await adminSupabase.from('meta_channels').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || data.status === 'disconnected') {
    throw new Error('Connect a WhatsApp Business account before using Meta features.');
  }

  return {
    row: data as Record<string, unknown>,
    accessToken: decryptAccessToken(String(data.access_token_ciphertext)),
  };
}

async function getMessengerChannelWithToken(userId: string) {
  const { data, error } = await adminSupabase
    .from('messenger_channels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || data.status === 'disconnected') {
    throw new Error('Connect a Messenger Page before replying from Inbox.');
  }

  return {
    row: data as Record<string, unknown>,
    accessToken: decryptAccessToken(String(data.page_access_token_ciphertext)),
  };
}

async function getInstagramChannelWithToken(userId: string) {
  const { data, error } = await adminSupabase
    .from('instagram_channels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || data.status === 'disconnected') {
    throw new Error('Connect an Instagram Business account before replying from Inbox.');
  }

  const row = data as Record<string, unknown>;
  const pageAccessToken = decryptAccessToken(String(row.page_access_token_ciphertext));
  const userAccessTokenCiphertext = normalizeOptionalString(row.user_access_token_ciphertext);

  return {
    row,
    accessToken: pageAccessToken,
    pageAccessToken,
    userAccessToken: userAccessTokenCiphertext ? decryptAccessToken(userAccessTokenCiphertext) : pageAccessToken,
  };
}

function getConnectedChannelRow(row: Record<string, unknown> | null) {
  return row?.status === 'disconnected' ? null : row;
}

function getDisconnectedChannelMetadata(
  row: Record<string, unknown>,
  disconnectedAt: string,
): Record<string, unknown> {
  const metadata = isRecord(row.metadata) ? { ...row.metadata } : {};

  return {
    ...metadata,
    disconnect: {
      disconnectedAt,
      previousStatus: normalizeOptionalString(row.status) || 'connected',
    },
  };
}

async function softDisconnectChannelRow(args: {
  tableName: string;
  userId: string;
  channelLabel: string;
  extraUpdates?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const rowResult = await adminSupabase
    .from(args.tableName)
    .select('*')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (rowResult.error) {
    throw rowResult.error;
  }

  const row = (rowResult.data as Record<string, unknown> | null) || null;

  if (!row) {
    return { ok: true as const };
  }

  const disconnectedAt = new Date().toISOString();
  const { error } = await adminSupabase
    .from(args.tableName)
    .update({
      status: 'disconnected',
      metadata: args.metadata || getDisconnectedChannelMetadata(row, disconnectedAt),
      last_synced_at: disconnectedAt,
      updated_at: disconnectedAt,
      ...(args.extraUpdates || {}),
    })
    .eq('user_id', args.userId);

  if (error) {
    throw error;
  }

  return { ok: true as const };
}

async function disconnectChannelStorage(args: {
  tableName: string;
  userId: string;
  channelLabel: string;
  extraUpdates?: Record<string, unknown>;
  metadataBuilder?: (row: Record<string, unknown>, disconnectedAt: string) => Record<string, unknown>;
}) {
  const { error } = await adminSupabase
    .from(args.tableName)
    .delete()
    .eq('user_id', args.userId);

  if (!error || isMissingSchemaError(error)) {
    return { ok: true as const };
  }

  console.error(`Failed to hard-delete ${args.channelLabel} channel; marking it disconnected instead.`, error);

  const rowResult = await adminSupabase
    .from(args.tableName)
    .select('*')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (rowResult.error) {
    throw rowResult.error;
  }

  const row = (rowResult.data as Record<string, unknown> | null) || null;

  if (!row) {
    return { ok: true as const };
  }

  const disconnectedAt = new Date().toISOString();

  return softDisconnectChannelRow({
    tableName: args.tableName,
    userId: args.userId,
    channelLabel: args.channelLabel,
    extraUpdates: args.extraUpdates,
    metadata: args.metadataBuilder
      ? args.metadataBuilder(row, disconnectedAt)
      : getDisconnectedChannelMetadata(row, disconnectedAt),
  });
}

async function subscribeMetaAppToPageMessagingWebhook(fields: readonly string[]) {
  if (!metaAppId || !metaAppSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required to configure Meta Page webhooks.');
  }

  if (!messengerWebhookVerifyToken) {
    throw new Error('MESSENGER_WEBHOOK_VERIFY_TOKEN is required to configure Meta Page webhooks.');
  }

  return metaRequestDetailed<{
    success?: boolean;
  }>({
    accessToken: `${metaAppId}|${metaAppSecret}`,
    path: `${metaAppId}/subscriptions`,
    method: 'POST',
    query: {
      object: 'page',
      callback_url: getMessengerWebhookCallbackUrl(),
      fields: fields.join(','),
      verify_token: messengerWebhookVerifyToken,
      include_values: true,
    },
  });
}

async function disconnectMetaChannel(userId: string) {
  const templatesResult = await adminSupabase
    .from('meta_templates')
    .delete()
    .eq('user_id', userId);

  if (templatesResult.error && !isMissingSchemaError(templatesResult.error)) {
    console.error('Failed to delete WhatsApp templates during channel disconnect.', templatesResult.error);
  }

  return disconnectChannelStorage({
    tableName: 'meta_channels',
    userId,
    channelLabel: 'WhatsApp',
  });
}

async function disconnectInstagramChannel(userId: string) {
  return disconnectChannelStorage({
    tableName: 'instagram_channels',
    userId,
    channelLabel: 'Instagram',
    metadataBuilder: (row, disconnectedAt) => {
      const metadata = getDisconnectedChannelMetadata(row, disconnectedAt);
      const webhookSubscription = isRecord(metadata.webhookSubscription)
        ? metadata.webhookSubscription
        : {};

      return {
        ...metadata,
        webhookSubscription: {
          ...webhookSubscription,
          subscribed: false,
          updatedAt: disconnectedAt,
        },
      };
    },
  });
}

async function disconnectMessengerChannel(userId: string) {
  return disconnectChannelStorage({
    tableName: 'messenger_channels',
    userId,
    channelLabel: 'Messenger',
    extraUpdates: {
      webhook_subscribed: false,
    },
  });
}

async function resolveReusableMetaAccessToken(
  userId: string,
  providedAccessToken: string | undefined | null,
  featureName: string,
) {
  const normalizedAccessToken = normalizeOptionalString(providedAccessToken);

  if (normalizedAccessToken) {
    return normalizedAccessToken;
  }

  try {
    const { accessToken } = await getChannelWithToken(userId);
    return accessToken;
  } catch {
    throw new Error(
      `${featureName} needs a Meta access token. Connect WhatsApp through embedded setup first, or complete the dedicated Meta login flow.`,
    );
  }
}

async function resolveInstagramBusinessToken(
  userId: string,
  longLivedToken: string | undefined | null,
  accessToken: string | undefined | null,
) {
  const normalizedLongLivedToken = normalizeOptionalString(longLivedToken);

  if (normalizedLongLivedToken) {
    return normalizedLongLivedToken;
  }

  const normalizedAccessToken = normalizeOptionalString(accessToken);

  if (normalizedAccessToken) {
    return exchangeInstagramLongLivedAccessToken(normalizedAccessToken);
  }

  return resolveReusableMetaAccessToken(userId, null, 'Instagram DM setup');
}

async function getEmailConnectionRow(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data as Record<string, unknown> | null) || null;
}

async function getStoredEmailConnection(userId: string) {
  return mapEmailConnection(await getEmailConnectionRow(userId));
}

async function getEmailConnectionWithPassword(userId: string) {
  const row = await getEmailConnectionRow(userId);

  if (!row) {
    throw new Error('Connect an email account before using email features.');
  }

  const passwordCiphertext = normalizeOptionalString(row.password_ciphertext);

  if (!passwordCiphertext) {
    throw new Error('The saved email password is missing. Reconnect the email account.');
  }

  return {
    row,
    connection: mapEmailConnection(row)!,
    password: decryptAccessToken(passwordCiphertext),
  };
}

function createEmailTransporter(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: config.smtpPort === 587,
    auth: {
      user: config.authUser,
      pass: config.password,
    },
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 45_000,
    tls: {
      servername: config.smtpHost,
    },
  });
}

function getEmailVerificationErrorMessage(error: unknown, protocol: 'SMTP' | 'IMAP') {
  const fallback = `${protocol} verification failed.`;

  if (!(error instanceof Error)) {
    return fallback;
  }

  const code = normalizeOptionalString((error as Error & { code?: unknown }).code);
  const message = error.message || fallback;

  if (code === 'ETIMEDOUT' || /timed out|timeout/i.test(message)) {
    return `${protocol} connection timed out. Check the host, port, SSL/TLS setting, and whether your provider allows app-password access from this server.`;
  }

  if (/certificate|tls|ssl/i.test(message)) {
    return `${protocol} TLS verification failed. Check whether this port uses SSL/TLS directly or STARTTLS.`;
  }

  if (/auth|credentials|login|password/i.test(message)) {
    return `${protocol} authentication failed. Check the username and app password.`;
  }

  return message;
}

async function verifySmtpConnection(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  const startedAt = Date.now();

  try {
    const transporter = createEmailTransporter(config);
    await transporter.verify();

    return {
      ok: true,
      message: 'SMTP connection verified successfully.',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: getEmailVerificationErrorMessage(error, 'SMTP'),
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function verifyImapConnection(config: ReturnType<typeof normalizeEmailConnectionInput>) {
  const startedAt = Date.now();
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.authUser,
      pass: config.password,
    },
    socketTimeout: 45_000,
    greetingTimeout: 30_000,
    connectionTimeout: 30_000,
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: true });

    return {
      ok: true,
      message: 'IMAP connection verified successfully.',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      message: getEmailVerificationErrorMessage(error, 'IMAP'),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function verifyEmailConnectionInput(
  input: EmailConnectionUpsertInput,
): Promise<EmailConnectionVerifyResponse> {
  const normalizedInput = normalizeEmailConnectionInput(input);
  const [smtp, imap] = await Promise.all([
    verifySmtpConnection(normalizedInput),
    verifyImapConnection(normalizedInput),
  ]);

  return {
    smtp,
    imap,
    canConnect: smtp.ok && imap.ok,
  };
}

async function saveEmailConnection(userId: string, input: EmailConnectionUpsertInput) {
  const normalizedInput = normalizeEmailConnectionInput(input);
  const verification = await verifyEmailConnectionInput(normalizedInput);

  if (!verification.canConnect) {
    const messages = [verification.smtp.message, verification.imap.message].filter(Boolean);
    throw new Error(messages.join(' '));
  }

  const payload = {
    user_id: userId,
    display_name: normalizedInput.displayName,
    email_address: normalizedInput.emailAddress,
    auth_user: normalizedInput.authUser,
    password_ciphertext: encryptAccessToken(normalizedInput.password),
    smtp_host: normalizedInput.smtpHost,
    smtp_port: normalizedInput.smtpPort,
    smtp_secure: normalizedInput.smtpSecure,
    imap_host: normalizedInput.imapHost,
    imap_port: normalizedInput.imapPort,
    imap_secure: normalizedInput.imapSecure,
    status: 'connected',
    last_verified_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_connections')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailConnection(data as Record<string, unknown>)!;
}

async function deleteEmailConnection(userId: string) {
  const { error } = await adminSupabase.from('email_connections').delete().eq('user_id', userId);

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return { ok: true as const };
}

function mapParsedAddressList(addresses: { address?: string | null }[] | undefined) {
  return (addresses || [])
    .map((entry) => normalizeEmailAddress(entry.address))
    .filter((entry): entry is string => Boolean(entry));
}

async function fetchEmailInbox(userId: string, options?: { limit?: number }) {
  const { connection, password } = await getEmailConnectionWithPassword(userId);
  const client = new ImapFlow({
    host: connection.imapHost,
    port: connection.imapPort,
    secure: connection.imapSecure,
    auth: {
      user: connection.authUser,
      pass: password,
    },
    socketTimeout: 15_000,
    greetingTimeout: 10_000,
    connectionTimeout: 10_000,
    logger: false,
  });

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
    const total = mailbox.exists || 0;
    const limit = Math.max(1, Math.min(options?.limit || 20, 50));

    if (total === 0) {
      return [];
    }

    const startSequence = Math.max(total - limit + 1, 1);
    const messages: EmailMessage[] = [];

    for await (const message of client.fetch(`${startSequence}:${total}`, {
      uid: true,
      envelope: true,
      flags: true,
      source: true,
    })) {
      const parsed = await simpleParser(message.source as Buffer);
      const htmlBody =
        typeof parsed.html === 'string'
          ? parsed.html
          : parsed.html
            ? String(parsed.html)
            : null;
      const textBody = normalizeOptionalString(parsed.text);
      const fromEntry = parsed.from?.value?.[0];
      const previewText = (textBody || (htmlBody ? stripHtmlTags(htmlBody) : '') || 'No preview available.').slice(0, 180);
      const flagValues = Array.from(message.flags || []);

      messages.push({
        id: `${message.uid || message.seq}:${parsed.messageId || parsed.subject || 'email'}`,
        folder: 'INBOX',
        subject: normalizeOptionalString(parsed.subject) || 'No subject',
        fromName: normalizeOptionalString(fromEntry?.name),
        fromEmail: normalizeEmailAddress(fromEntry?.address),
        to: mapParsedAddressList(parsed.to?.value),
        receivedAt:
          parsed.date?.toISOString() ||
          (message.envelope?.date instanceof Date ? message.envelope.date.toISOString() : null),
        htmlBody,
        textBody,
        previewText,
        isUnread: !flagValues.includes('\\Seen'),
      });
    }

    const orderedMessages = messages.reverse();
    await syncIncomingEmailNotifications(userId, orderedMessages);
    return orderedMessages;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function getEmailTemplateById(userId: string, templateId: string) {
  const { data, error } = await adminSupabase
    .from('email_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Email template not found.');
  }

  return mapEmailTemplate(data as Record<string, unknown>);
}

async function getEmailTemplates(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data || []).map((row) => mapEmailTemplate(row as Record<string, unknown>));
}

async function saveEmailTemplate(userId: string, input: EmailTemplateSaveInput) {
  const normalizedInput = normalizeEmailTemplateInput(input);
  const payload = {
    user_id: userId,
    name: normalizedInput.name,
    subject: normalizedInput.subject,
    editor_mode: normalizedInput.editorMode,
    html_content: normalizedInput.htmlContent,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_templates')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailTemplate(data as Record<string, unknown>);
}

async function deleteEmailTemplate(userId: string, templateId: string) {
  const { error } = await adminSupabase
    .from('email_templates')
    .delete()
    .eq('user_id', userId)
    .eq('id', templateId);

  if (error) {
    throw error;
  }

  return { ok: true as const };
}

async function getEmailCampaigns(userId: string) {
  const { data, error } = await adminSupabase
    .from('email_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }

  return (data || []).map((row) => mapEmailCampaign(row as Record<string, unknown>));
}

async function insertEmailCampaign(args: {
  userId: string;
  template: EmailTemplate;
  campaignName: string;
  audienceSource: EmailCampaign['audienceSource'];
  recipientCount: number;
  status: EmailCampaign['status'];
  sentAt: string | null;
}) {
  const payload = {
    user_id: args.userId,
    email_template_id: args.template.id,
    template_name: args.template.name,
    campaign_name: args.campaignName,
    subject: args.template.subject,
    html_content: args.template.htmlContent,
    audience_source: args.audienceSource,
    recipient_count: args.recipientCount,
    status: args.status,
    sent_at: args.sentAt,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('email_campaigns')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapEmailCampaign(data as Record<string, unknown>);
}

async function sendEmailCampaign(userId: string, input: EmailCampaignSendInput) {
  const normalizedInput = normalizeEmailCampaignInput(input);
  const { connection, password } = await getEmailConnectionWithPassword(userId);
  const template = await getEmailTemplateById(userId, normalizedInput.templateId);
  const transporter = nodemailer.createTransport({
    host: connection.smtpHost,
    port: connection.smtpPort,
    secure: connection.smtpSecure,
    auth: {
      user: connection.authUser,
      pass: password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  let deliveredCount = 0;

  for (const recipient of normalizedInput.recipients) {
    try {
      await transporter.sendMail({
        from: {
          name: connection.displayName,
          address: connection.emailAddress,
        },
        to: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
        subject: template.subject,
        html: template.htmlContent,
      });
      deliveredCount += 1;
    } catch (error) {
      console.error('Email send failure:', error);
    }
  }

  const status: EmailCampaign['status'] =
    deliveredCount === normalizedInput.recipients.length
      ? 'sent'
      : deliveredCount > 0
        ? 'partial'
        : 'failed';

  const campaign = await insertEmailCampaign({
    userId,
    template,
    campaignName: normalizedInput.campaignName,
    audienceSource: normalizedInput.audienceSource,
    recipientCount: normalizedInput.recipients.length,
    status,
    sentAt: deliveredCount > 0 ? new Date().toISOString() : null,
  });

  if (campaign.status === 'sent') {
    await createUserNotification({
      userId,
      type: 'email_campaign_sent',
      title: 'Email campaign sent successfully',
      body: `${campaign.campaignName} reached ${campaign.recipientCount} recipient${
        campaign.recipientCount === 1 ? '' : 's'
      }.`,
      targetPath: '/dashboard/emails/template-builder',
      metadata: {
        campaignId: campaign.id,
        recipientCount: campaign.recipientCount,
        status: campaign.status,
      },
    });
  }

  return campaign;
}

async function getConversationalAutomationConfigRow(userId: string) {
  const { data, error } = await adminSupabase
    .from('meta_conversational_automation_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Record<string, unknown> | null) || null;
}

async function getConversationalAutomationConfig(
  userId: string,
  channelRow: Record<string, unknown> | null,
) {
  const row = await getConversationalAutomationConfigRow(userId);
  return mapConversationalAutomationConfig(row, {
    userId,
    channelRow,
  });
}

async function saveConversationalAutomationConfig(args: {
  userId: string;
  channelRow: Record<string, unknown> | null;
  input: Required<WhatsAppConversationalAutomationUpdateInput>;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}) {
  const currentRow = await getConversationalAutomationConfigRow(args.userId);
  const payload = {
    user_id: args.userId,
    meta_channel_id: args.channelRow ? String(args.channelRow.id) : null,
    enable_welcome_message: args.input.enableWelcomeMessage,
    prompts: args.input.prompts,
    commands: args.input.commands.map((command) => ({
      commandName: command.commandName,
      commandDescription: command.commandDescription,
    })),
    last_synced_at:
      args.lastSyncedAt !== undefined
        ? args.lastSyncedAt
        : normalizeOptionalString(currentRow?.last_synced_at),
    last_error:
      args.lastError !== undefined
        ? args.lastError
        : normalizeOptionalString(currentRow?.last_error),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('meta_conversational_automation_configs')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapConversationalAutomationConfig(data as Record<string, unknown>, {
    userId: args.userId,
    channelRow: args.channelRow,
  });
}

async function getAutomationRules(userId: string) {
  const { data, error } = await adminSupabase
    .from('automation_rules')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapAutomationRule(row as Record<string, unknown>));
}

async function saveAutomationRules(args: {
  userId: string;
  channelRow: Record<string, unknown> | null;
  rules: NormalizedAutomationRuleInput[];
}) {
  const existingResult = await adminSupabase
    .from('automation_rules')
    .select('id')
    .eq('user_id', args.userId);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingIds = new Set((existingResult.data || []).map((row) => String(row.id)));
  const keptIds = new Set(args.rules.map((rule) => rule.id).filter((id): id is string => Boolean(id)));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  if (removedIds.length > 0) {
    const deleteResult = await adminSupabase
      .from('automation_rules')
      .delete()
      .eq('user_id', args.userId)
      .in('id', removedIds);

    if (deleteResult.error) {
      throw deleteResult.error;
    }
  }

  for (const rule of args.rules) {
    const payload = {
      user_id: args.userId,
      meta_channel_id: args.channelRow ? String(args.channelRow.id) : null,
      name: rule.name,
      is_enabled: rule.isEnabled,
      trigger_type: rule.triggerType,
      keyword: rule.keyword,
      keyword_match_mode: rule.keywordMatchMode,
      action: {
        ...rule.action,
        filters: rule.filters,
      },
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (rule.id && existingIds.has(rule.id)) {
      const updateResult = await adminSupabase
        .from('automation_rules')
        .update(payload)
        .eq('user_id', args.userId)
        .eq('id', rule.id);

      if (updateResult.error) {
        throw updateResult.error;
      }
    } else {
      const insertResult = await adminSupabase
        .from('automation_rules')
        .insert(payload);

      if (insertResult.error) {
        throw insertResult.error;
      }
    }
  }

  return getAutomationRules(args.userId);
}

async function getEnabledAutomationRules(userId: string) {
  const { data, error } = await adminSupabase
    .from('automation_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapAutomationRule(row as Record<string, unknown>));
}

function doesAutomationRuleMatchIncomingText(rule: AutomationRule, text: string | null | undefined) {
  const incomingText = normalizeOptionalString(text)?.toLowerCase();
  const keyword = normalizeOptionalString(rule.keyword)?.toLowerCase();
  const isWhatsAppMessageTrigger =
    rule.triggerType === 'incoming_message_keyword' ||
    rule.triggerType === 'whatsapp_message_received';

  if (!isWhatsAppMessageTrigger) {
    return false;
  }

  if (rule.keywordMatchMode === 'any') {
    return true;
  }

  if (!incomingText || !keyword) {
    return false;
  }

  return doesKeywordMatchText({
    text: incomingText,
    keyword,
    matchMode: rule.keywordMatchMode,
  });
}

function getEditDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function doesKeywordMatchText(args: {
  text: string;
  keyword: string;
  matchMode: AutomationRule['keywordMatchMode'] | AutomationRuleFilterCondition['operator'];
}) {
  const text = args.text.trim().toLowerCase();
  const keyword = args.keyword.trim().toLowerCase();

  if (!text || !keyword) {
    return false;
  }

  switch (args.matchMode) {
    case 'equals':
      return text === keyword;
    case 'starts_with':
      return text.startsWith(keyword);
    case 'ends_with':
      return text.endsWith(keyword);
    case 'fuzzy': {
      if (text.includes(keyword)) {
        return true;
      }

      const threshold = Math.max(1, Math.floor(keyword.length * 0.25));
      return [text, ...text.split(/\s+/)].some((candidate) => {
        if (Math.abs(candidate.length - keyword.length) > threshold) {
          return false;
        }

        return getEditDistance(candidate, keyword) <= threshold;
      });
    }
    case 'contains':
    case 'contains_any':
    default:
      return text.includes(keyword);
  }
}

function parseTimeToMinutes(value: string | null | undefined) {
  const match = normalizeOptionalString(value)?.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isMinuteWithinRange(current: number, start: number, end: number) {
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

function evaluateAutomationRuleCondition(args: {
  condition: AutomationRuleFilterCondition;
  body: string | null;
  receivedAt: Date;
  isNewConversation: boolean;
  contactExists: boolean;
  noKeywordMatches: boolean;
  contact: ConversationThread;
}) {
  const condition = args.condition;
  const body = normalizeOptionalString(args.body)?.toLowerCase() || '';

  switch (condition.type) {
    case 'message_contains_keywords': {
      const keywords = (condition.values || [])
        .map((value) => normalizeOptionalString(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value));

      if (keywords.length === 0 || !body) {
        return false;
      }

      return keywords.some((keywordValue) =>
        doesKeywordMatchText({
          text: body,
          keyword: keywordValue,
          matchMode: condition.operator,
        }),
      );
    }
    case 'contact_initiates_chat':
      return args.isNewConversation;
    case 'timestamp': {
      const start = parseTimeToMinutes(condition.startTime);
      const end = parseTimeToMinutes(condition.endTime);

      if (start === null || end === null) {
        return false;
      }

      const current = args.receivedAt.getHours() * 60 + args.receivedAt.getMinutes();
      const withinRange = isMinuteWithinRange(current, start, end);
      return condition.operator === 'outside' ? !withinRange : withinRange;
    }
    case 'contact_exists':
      return condition.operator === 'is_false' ? !args.contactExists : args.contactExists;
    case 'contact_attribute': {
      const field = normalizeOptionalString(condition.field);
      const expected = normalizeOptionalString(condition.value)?.toLowerCase();

      if (!field || !expected) {
        return false;
      }

      const contactRecord = args.contact as unknown as Record<string, unknown>;
      const attributes = isRecord(contactRecord.attributes)
        ? (contactRecord.attributes as Record<string, unknown>)
        : {};
      const actualValue = normalizeOptionalString(contactRecord[field] ?? attributes[field]);

      if (field === 'tags' || field === 'labels') {
        const labels = Array.isArray(contactRecord.labels)
          ? contactRecord.labels.map((label) => normalizeOptionalString(label)?.toLowerCase()).filter(Boolean)
          : [];
        const hasExpectedLabel = labels.some((label) => label?.includes(expected));
        return condition.operator === 'does_not_equal' ? !hasExpectedLabel : hasExpectedLabel;
      }

      const actual = actualValue?.toLowerCase() || '';
      if (condition.operator === 'does_not_equal') {
        return actual !== expected;
      }

      return condition.operator === 'equals' ? actual === expected : actual.includes(expected);
    }
    case 'no_keyword_matches':
      return args.noKeywordMatches;
    default:
      return false;
  }
}

function doesAutomationRuleFilterGroupMatch(args: {
  rule: AutomationRule;
  body: string | null;
  receivedAt: Date;
  isNewConversation: boolean;
  contactExists: boolean;
  noKeywordMatches?: boolean;
  contact: ConversationThread;
}) {
  const filters = args.rule.filters || args.rule.action.filters;

  if (!filters || filters.conditions.length === 0) {
    return doesAutomationRuleMatchIncomingText(args.rule, args.body);
  }

  const results = filters.conditions.map((condition) =>
    evaluateAutomationRuleCondition({
      condition,
      body: args.body,
      receivedAt: args.receivedAt,
      isNewConversation: args.isNewConversation,
      contactExists: args.contactExists,
      noKeywordMatches: Boolean(args.noKeywordMatches),
      contact: args.contact,
    }),
  );

  return filters.operator === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

function doesAutomationRuleHaveKeywordCondition(rule: AutomationRule) {
  const filters = rule.filters || rule.action.filters;

  return Boolean(filters?.conditions.some((condition) => condition.type === 'message_contains_keywords'));
}

function doesAutomationRuleKeywordConditionMatch(rule: AutomationRule, body: string | null) {
  const filters = rule.filters || rule.action.filters;

  if (!filters) {
    return doesAutomationRuleMatchIncomingText(rule, body);
  }

  return filters.conditions.some((condition) => {
    return condition.type === 'message_contains_keywords'
      ? evaluateAutomationRuleCondition({
          condition,
          body,
          receivedAt: new Date(),
          isNewConversation: false,
          contactExists: true,
          noKeywordMatches: false,
          contact: {} as ConversationThread,
        })
      : false;
  });
}

async function markAutomationRuleTriggered(userId: string, rule: AutomationRule, triggeredAt: string) {
  const { error } = await adminSupabase
    .from('automation_rules')
    .update({
      last_triggered_at: triggeredAt,
      trigger_count: rule.triggerCount + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', rule.id);

  if (error) {
    throw error;
  }
}

async function markAutomationRuleError(userId: string, ruleId: string, error: unknown) {
  const updateErrorMessage = mapDbError(error).slice(0, 1000);
  const { error: updateError } = await adminSupabase
    .from('automation_rules')
    .update({
      last_error: updateErrorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', ruleId);

  if (updateError) {
    console.error('Failed to record automation rule error:', updateError);
  }
}

async function setContactMarketingOptOutFromAutomation(args: {
  userId: string;
  thread: ConversationThread;
  recipientWaId?: string | null;
}) {
  const identity =
    normalizeOptionalString(args.recipientWaId) ||
    normalizeOptionalString(args.thread.contactWaId) ||
    normalizeOptionalString(args.thread.displayPhone);
  const rowsById = new Map<string, Record<string, unknown>>();

  if (args.thread.id) {
    rowsById.set(args.thread.id, args.thread as unknown as Record<string, unknown>);
  }

  if (identity) {
    const matchingRows = await findConversationThreadRowsByIdentity(args.userId, identity);

    for (const row of matchingRows) {
      rowsById.set(String(row.id), row);
    }
  }

  const threadIds = Array.from(rowsById.keys()).filter(Boolean);

  if (!threadIds.length) {
    throw new Error('Automation could not identify the contact to opt out of marketing.');
  }

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .update({
      marketing_opted_out: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', args.userId)
    .in('id', threadIds)
    .select('*');

  if (error) {
    throw error;
  }

  const rows = (data || []) as Record<string, unknown>[];
  const activeRow =
    rows.find((row) => String(row.id) === args.thread.id) ||
    rows[0] ||
    null;

  if (!activeRow) {
    throw new Error('Automation could not update the contact marketing preference.');
  }

  return mapThread(activeRow);
}

async function processAutomationRulesForLeadCreated(args: {
  userId: string;
  contact: ConversationThread;
}) {
  let rules: AutomationRule[] = [];

  try {
    rules = await getEnabledAutomationRules(args.userId);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('Automation rules table is missing. Apply supabase/schema.sql to enable lead-created triggers.');
      return;
    }

    throw error;
  }

  for (const rule of rules) {
    if (rule.triggerType !== 'lead_created') {
      continue;
    }

    const filters = rule.filters || rule.action.filters;
    const matches =
      !filters || filters.conditions.length === 0
        ? true
        : doesAutomationRuleFilterGroupMatch({
            rule,
            body: args.contact.remark || args.contact.lastMessageText,
            receivedAt: new Date(args.contact.createdAt),
            isNewConversation: true,
            contactExists: true,
            noKeywordMatches: true,
            contact: args.contact,
          });

    if (!matches) {
      continue;
    }

    try {
      if (rule.action.type === 'opt_out_marketing') {
        await setContactMarketingOptOutFromAutomation({
          userId: args.userId,
          thread: args.contact,
          recipientWaId: args.contact.contactWaId,
        });
        await markAutomationRuleTriggered(args.userId, rule, new Date().toISOString());
        continue;
      }

      const { row, accessToken } = await getChannelWithToken(args.userId);
      const recipientWaId = normalizeOutgoingWhatsAppRecipient(args.contact.contactWaId);

      if (!recipientWaId) {
        throw new Error('Lead-created trigger requires a WhatsApp-compatible contact number.');
      }

      await sendAutomationRuleResponse({
        userId: args.userId,
        metaChannelId: String(row.id),
        phoneNumberId: String(row.phone_number_id),
        accessToken,
        thread: args.contact,
        recipientWaId,
        rule,
      });
      await markAutomationRuleTriggered(args.userId, rule, new Date().toISOString());
    } catch (error) {
      console.error('Lead-created automation rule execution failed:', error);
      await markAutomationRuleError(args.userId, rule.id, error);
    }
  }
}

async function sendAutomationRuleResponse(args: {
  userId: string;
  metaChannelId: string;
  phoneNumberId: string;
  accessToken: string;
  thread: ConversationThread;
  recipientWaId: string;
  rule: AutomationRule;
  triggerMessageId?: string | null;
}) {
  const action = args.rule.action;
  let messagePayload: WhatsAppMessagePayload;

  if (action.type === 'opt_out_marketing') {
    const nextThread = await setContactMarketingOptOutFromAutomation({
      userId: args.userId,
      thread: args.thread,
      recipientWaId: args.recipientWaId,
    });

    return {
      thread: nextThread,
      message: null,
    };
  }

  if (action.type === 'send_template') {
    await assertMarketingTemplateSendAllowed({
      userId: args.userId,
      to: args.recipientWaId,
      templateName: action.templateName || '',
      language: action.templateLanguage || '',
      threadId: args.thread.id,
    });
    messagePayload = await buildOutgoingTemplatePayloadWithStoredDefaults(args.userId, {
      to: args.recipientWaId,
      templateName: action.templateName || '',
      language: action.templateLanguage || '',
      replyToMessageId: args.triggerMessageId || undefined,
    });
  } else if (action.type === 'send_flow') {
    messagePayload = await buildOutgoingFlowPayload({
      userId: args.userId,
      to: args.recipientWaId,
      action,
      replyToMessageId: args.triggerMessageId || undefined,
    });
  } else {
    messagePayload = buildOutgoingTextPayload({
      to: args.recipientWaId,
      body: action.messageBody || '',
      previewUrl: false,
      replyToMessageId: args.triggerMessageId || undefined,
    });
  }

  const remote = await sendRemoteWhatsAppMessage(args.accessToken, args.phoneNumberId, messagePayload);
  const createdAt = new Date().toISOString();
  const descriptor = await describeOutgoingWhatsAppMessage(args.userId, messagePayload);
  const nextThread = await upsertThread({
    userId: args.userId,
    metaChannelId: args.metaChannelId,
    contactWaId: args.thread.contactWaId,
    contactName: args.thread.contactName,
    displayPhone: args.recipientWaId,
    status: 'Connected',
    lastMessageText: descriptor.body,
    lastMessageAt: createdAt,
    unreadDelta: 0,
  });

  const message = await insertMessage({
    userId: args.userId,
    threadId: nextThread.id,
    waMessageId: remote.messages?.[0]?.id || null,
    direction: 'outbound',
    messageType: descriptor.messageType,
    body: descriptor.body,
    senderName: 'Automation rule',
    senderWaId: args.phoneNumberId,
    recipientWaId: args.recipientWaId,
    templateName: descriptor.templateName,
    status: 'sent',
    raw: {
      automation_rule_id: args.rule.id,
      automation_rule_name: args.rule.name,
      trigger_message_id: args.triggerMessageId || null,
      to: args.recipientWaId,
      recipient_type: messagePayload.recipient_type || 'individual',
      ...descriptor.raw,
      remote,
    },
  });

  return {
    thread: nextThread,
    message,
  };
}

async function processAutomationRulesForIncomingMessage(args: {
  userId: string;
  metaChannelId: string;
  phoneNumberId: string;
  accessToken: string;
  thread: ConversationThread;
  body: string | null;
  receivedAt?: string | null;
  isNewConversation?: boolean;
  contactExists?: boolean;
  senderWaId: string | null;
  messageId: string | null;
}) {
  const recipientWaId = normalizeOutgoingWhatsAppRecipient(args.senderWaId);

  if (!recipientWaId) {
    return;
  }

  let rules: AutomationRule[] = [];

  try {
    rules = await getEnabledAutomationRules(args.userId);
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('Automation rules table is missing. Apply supabase/schema.sql to enable trigger rules.');
      return;
    }

    throw error;
  }

  const noKeywordMatches = !rules.some((rule) => {
    const isWhatsAppMessageTrigger =
      rule.triggerType === 'incoming_message_keyword' ||
      rule.triggerType === 'whatsapp_message_received';

    return isWhatsAppMessageTrigger && doesAutomationRuleHaveKeywordCondition(rule) && doesAutomationRuleKeywordConditionMatch(rule, args.body);
  });

  for (const rule of rules) {
    if (
      rule.triggerType !== 'incoming_message_keyword' &&
      rule.triggerType !== 'whatsapp_message_received'
    ) {
      continue;
    }

    if (
      !doesAutomationRuleFilterGroupMatch({
        rule,
        body: args.body,
        receivedAt: args.receivedAt ? new Date(args.receivedAt) : new Date(),
        isNewConversation: Boolean(args.isNewConversation),
        contactExists: args.contactExists ?? true,
        noKeywordMatches,
        contact: args.thread,
      })
    ) {
      continue;
    }

    try {
      await sendAutomationRuleResponse({
        userId: args.userId,
        metaChannelId: args.metaChannelId,
        phoneNumberId: args.phoneNumberId,
        accessToken: args.accessToken,
        thread: args.thread,
        recipientWaId,
        rule,
        triggerMessageId: args.messageId,
      });
      await markAutomationRuleTriggered(args.userId, rule, new Date().toISOString());
    } catch (error) {
      console.error('Automation rule execution failed:', error);
      await markAutomationRuleError(args.userId, rule.id, error);
    }
  }
}

async function refreshChannelSnapshot(userId: string, row: Record<string, unknown>, accessToken: string) {
  const [phone, waba] = await Promise.all([
    fetchPhoneNumber(accessToken, String(row.phone_number_id)),
    fetchWaba(accessToken, String(row.waba_id)),
  ]);
  const syncedAt = new Date().toISOString();
  const metadata = mergeLiveTwoStepVerificationMetadata(
    getMetaChannelMetadataRecord(row),
    phone,
    syncedAt,
  );

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .update({
      display_phone_number: phone.display_phone_number || null,
      verified_name: phone.verified_name || null,
      quality_rating: phone.quality_rating || null,
      messaging_limit_tier: getNormalizedMessagingLimitTier(phone),
      business_account_name: waba.name || null,
      metadata,
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq('user_id', userId)
    .eq('id', row.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    channelRow: data as Record<string, unknown>,
    phone,
  };
}

async function saveMetaChannel(args: {
  userId: string;
  setupType: string;
  connectionMethod: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  businessAccountName: string | null;
  metadataPatch?: Record<string, unknown>;
}) {
  const existingChannelResult = await adminSupabase
    .from('meta_channels')
    .select('phone_number_id,metadata')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (existingChannelResult.error) {
    throw existingChannelResult.error;
  }

  const existingChannel = (existingChannelResult.data as Record<string, unknown> | null) || null;
  const existingMetadata =
    existingChannel && isRecord(existingChannel.metadata)
      ? (existingChannel.metadata as Record<string, unknown>)
      : {};
  const shouldPreserveMetadata =
    normalizeOptionalIdentifier(existingChannel?.phone_number_id) === args.phoneNumberId;
  const nextMetadata = {
    ...(shouldPreserveMetadata ? existingMetadata : {}),
    ...(args.metadataPatch || {}),
  };
  const payload = {
    user_id: args.userId,
    setup_type: args.setupType,
    connection_method: args.connectionMethod,
    status: 'connected',
    waba_id: args.wabaId,
    phone_number_id: args.phoneNumberId,
    display_phone_number: args.displayPhoneNumber,
    verified_name: args.verifiedName,
    quality_rating: args.qualityRating,
    messaging_limit_tier: args.messagingLimitTier,
    business_account_name: args.businessAccountName,
    access_token_ciphertext: encryptAccessToken(args.accessToken),
    access_token_last4: last4(args.accessToken),
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('meta_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapChannel(data as Record<string, unknown>);
}

async function saveInstagramChannel(args: {
  userId: string;
  userAccessToken: string;
  pageAccessToken: string;
  pageId: string;
  pageName: string | null;
  instagramAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  profilePictureUrl: string | null;
}) {
  let webhookSubscribed = false;
  let webhookLastError: string | null = null;

  try {
    await subscribeInstagramPageToWebhook(args.pageAccessToken, args.pageId);
    webhookSubscribed = true;
  } catch (error) {
    webhookLastError = mapDbError(error);
  }

  const payload = {
    user_id: args.userId,
    connection_method: 'business_login',
    status: 'connected',
    instagram_account_id: args.instagramAccountId,
    instagram_username: args.instagramUsername,
    instagram_name: args.instagramName,
    profile_picture_url: args.profilePictureUrl,
    page_id: args.pageId,
    page_name: args.pageName,
    user_access_token_ciphertext: encryptAccessToken(args.userAccessToken),
    user_access_token_last4: last4(args.userAccessToken),
    page_access_token_ciphertext: encryptAccessToken(args.pageAccessToken),
    page_access_token_last4: last4(args.pageAccessToken),
    metadata: {
      webhookSubscription: {
        subscribed: webhookSubscribed,
        fields: [...DEFAULT_INSTAGRAM_WEBHOOK_FIELDS],
        lastError: webhookLastError,
        updatedAt: new Date().toISOString(),
      },
    },
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('instagram_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapInstagramChannel(data as Record<string, unknown>);
}

async function updateInstagramWebhookSubscription(args: {
  userId: string;
  row: Record<string, unknown>;
  subscribed: boolean;
  lastError: string | null;
}) {
  const metadata = isRecord(args.row.metadata) ? { ...args.row.metadata } : {};
  metadata.webhookSubscription = {
    subscribed: args.subscribed,
    fields: [...DEFAULT_INSTAGRAM_WEBHOOK_FIELDS],
    lastError: args.lastError,
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('instagram_channels')
    .update({
      status: args.lastError ? 'error' : 'connected',
      metadata,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', args.userId)
    .eq('id', String(args.row.id))
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapInstagramChannel(data as Record<string, unknown>);
}

async function activateInstagramWebhookSubscription(userId: string) {
  const { row, accessToken } = await getInstagramChannelWithToken(userId);
  const pageId = normalizeOptionalIdentifier(row.page_id);

  if (!pageId) {
    throw new Error('Instagram channel is missing the linked Facebook Page ID.');
  }

  try {
    await subscribeInstagramPageToWebhook(accessToken, pageId);
    return updateInstagramWebhookSubscription({
      userId,
      row,
      subscribed: true,
      lastError: null,
    });
  } catch (error) {
    await updateInstagramWebhookSubscription({
      userId,
      row,
      subscribed: false,
      lastError: mapDbError(error),
    });
    throw error;
  }
}

async function saveMessengerChannel(args: {
  userId: string;
  connectionMethod: MessengerChannelConnection['connectionMethod'];
  pageAccessToken: string;
  pageId: string;
  pageName: string | null;
  pagePictureUrl: string | null;
  pageTasks: string[];
  webhookSubscribed: boolean;
  webhookLastError: string | null;
}) {
  const payload = {
    user_id: args.userId,
    connection_method: args.connectionMethod,
    status: args.webhookLastError ? 'error' : 'connected',
    page_id: args.pageId,
    page_name: args.pageName,
    page_picture_url: args.pagePictureUrl,
    page_tasks: args.pageTasks,
    page_access_token_ciphertext: encryptAccessToken(args.pageAccessToken),
    page_access_token_last4: last4(args.pageAccessToken),
    webhook_fields: [...DEFAULT_MESSENGER_WEBHOOK_FIELDS],
    webhook_subscribed: args.webhookSubscribed,
    webhook_last_error: args.webhookLastError,
    metadata: {},
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('messenger_channels')
    .upsert(payload, {
      onConflict: 'user_id',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapMessengerChannel(data as Record<string, unknown>);
}

async function listInstagramConnectableAccounts(longLivedToken: string) {
  const pages = await fetchInstagramPages(longLivedToken);
  const connectablePages = pages.filter(
    (page) => normalizeOptionalString(page.access_token) && normalizeOptionalString(page.instagram_business_account?.id),
  );

  const accounts = await Promise.all(
    connectablePages.map(async (page) => {
      const pageAccessToken = normalizeOptionalString(page.access_token);
      const instagramAccountId = normalizeOptionalString(page.instagram_business_account?.id);

      if (!pageAccessToken || !instagramAccountId) {
        return null;
      }

      const profile = await fetchInstagramAccountProfile(
        longLivedToken,
        pageAccessToken,
        instagramAccountId,
      ).catch(() => null);

      return {
        pageId: String(page.id),
        pageName: normalizeOptionalString(page.name),
        instagramAccountId,
        instagramUsername: normalizeOptionalString(profile?.username),
        instagramName: normalizeOptionalString(profile?.name),
        profilePictureUrl: normalizeOptionalString(profile?.profile_picture_url),
      } as InstagramConnectableAccount;
    }),
  );

  return accounts.filter(Boolean) as InstagramConnectableAccount[];
}

async function listMessengerConnectablePages(userAccessToken: string) {
  const pages = await fetchMessengerPages(userAccessToken);

  return pages
    .filter(
      (page) =>
        normalizeOptionalIdentifier(page.id) &&
        normalizeOptionalString(page.access_token),
    )
    .map((page) => {
      const pageId = normalizeOptionalIdentifier(page.id) || '';

      return {
        pageId,
        pageName: normalizeOptionalString(page.name),
        pagePictureUrl: getGraphPictureUrl(page.picture),
        pageTasks: [],
        canSendMessages: true,
        canManageWebhooks: true,
      } satisfies MessengerConnectablePage;
    });
}

async function connectMessengerChannel(args: {
  userId: string;
  connectionMethod: MessengerChannelConnection['connectionMethod'];
  pageId: string;
  pageAccessToken: string;
}) {
  const page = await fetchMessengerPage(args.pageAccessToken, args.pageId);

  let webhookSubscribed = false;
  let webhookLastError: string | null = null;

  try {
    await subscribeMessengerPageToWebhook(args.pageAccessToken, args.pageId);
    webhookSubscribed = true;
  } catch (error) {
    webhookLastError = mapDbError(error);
  }

  const channel = await saveMessengerChannel({
    userId: args.userId,
    connectionMethod: args.connectionMethod,
    pageAccessToken: args.pageAccessToken,
    pageId: String(page.id || args.pageId),
    pageName: normalizeOptionalString(page.name),
    pagePictureUrl: getGraphPictureUrl(page.picture),
    pageTasks: [],
    webhookSubscribed,
    webhookLastError,
  });

  try {
    await syncMessengerPageConversations({
      userId: args.userId,
      pageId: String(page.id || args.pageId),
      pageName: normalizeOptionalString(page.name),
      pageAccessToken: args.pageAccessToken,
    });
  } catch (error) {
    console.error('Failed to sync Messenger Page conversations after connect:', error);
  }

  return channel;
}

async function syncTemplates(userId: string) {
  const { row, accessToken } = await getChannelWithToken(userId);
  const remoteTemplates = await listTemplates(accessToken, String(row.waba_id));
  const existingTemplatesResult = await adminSupabase
    .from('meta_templates')
    .select('id, template_name, language, status, raw')
    .eq('user_id', userId);

  if (existingTemplatesResult.error) {
    throw existingTemplatesResult.error;
  }

  const existingStatusByTemplate = new Map<string, string | null>();
  const existingHeaderMediaPreviewByTemplate = new Map<string, TemplateHeaderMediaPreview>();
  const remoteTemplateKeys = new Set<string>();

  for (const templateRow of existingTemplatesResult.data || []) {
    const templateName = normalizeOptionalString(templateRow.template_name);
    const language = normalizeOptionalString(templateRow.language);

    if (!templateName || !language) {
      continue;
    }

    existingStatusByTemplate.set(
      `${templateName}:${language}`,
      normalizeOptionalString(templateRow.status)?.toUpperCase() || null,
    );

    const headerMediaPreview = getTemplateHeaderMediaPreviewFromRaw(templateRow.raw);
    if (headerMediaPreview) {
      existingHeaderMediaPreviewByTemplate.set(`${templateName}:${language}`, headerMediaPreview);
    }
  }

  for (const template of remoteTemplates) {
    const templateName = String(template.name || '');
    const language = String(template.language || 'en_US');
    if (!templateName || !language) {
      continue;
    }

    const templateKey = `${templateName}:${language}`;
    remoteTemplateKeys.add(templateKey);
    const nextStatus = normalizeOptionalString(template.status)?.toUpperCase() || null;
    const previousStatus = existingStatusByTemplate.get(templateKey) || null;
    const raw = mergeTemplateHeaderMediaPreview(
      template as Record<string, unknown>,
      existingHeaderMediaPreviewByTemplate.get(templateKey) || null,
    );
    const payload = {
      user_id: userId,
      meta_channel_id: row.id,
      meta_template_id: (template.id as string | undefined) || null,
      template_name: templateName,
      category: (template.category as string | undefined) || null,
      language,
      status: (template.status as string | undefined) || null,
      raw,
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminSupabase.from('meta_templates').upsert(payload, {
      onConflict: 'user_id,template_name,language',
    });

    if (error) {
      throw error;
    }

    if (nextStatus && nextStatus !== previousStatus) {
      void dispatchDeveloperWebhookEvent(userId, 'template.status_updated', {
        templateName,
        language,
        previousStatus,
        currentStatus: nextStatus,
      }).catch((error) => {
        console.error('Failed to dispatch template.status_updated webhook:', error);
      });

      if (nextStatus === 'APPROVED') {
        await createUserNotification({
          userId,
          type: 'template_approved',
          title: 'WhatsApp template approved',
          body: `${templateName} is now approved and ready to use.`,
          targetPath: '/dashboard/templates',
          metadata: {
            templateName,
            language,
            previousStatus,
            currentStatus: nextStatus,
          },
          dedupeKey: `template-status:${templateName}:${language}:${previousStatus || 'unknown'}:${nextStatus}`,
        });
      }

      if (nextStatus === 'REJECTED') {
        await createUserNotification({
          userId,
          type: 'template_rejected',
          title: 'WhatsApp template rejected',
          body: `${templateName} was rejected. Review it before sending again.`,
          targetPath: '/dashboard/templates',
          metadata: {
            templateName,
            language,
            previousStatus,
            currentStatus: nextStatus,
          },
          dedupeKey: `template-status:${templateName}:${language}:${previousStatus || 'unknown'}:${nextStatus}`,
        });
      }
    }

    existingStatusByTemplate.set(templateKey, nextStatus);
  }

  const staleTemplateIds = (existingTemplatesResult.data || [])
    .filter((templateRow) => {
      const templateName = normalizeOptionalString(templateRow.template_name);
      const language = normalizeOptionalString(templateRow.language);
      return templateName && language && !remoteTemplateKeys.has(`${templateName}:${language}`);
    })
    .map((templateRow) => normalizeOptionalIdentifier(templateRow.id))
    .filter((templateId): templateId is string => Boolean(templateId));

  if (staleTemplateIds.length > 0) {
    const { error } = await adminSupabase
      .from('meta_templates')
      .delete()
      .eq('user_id', userId)
      .in('id', staleTemplateIds);

    if (error) {
      throw error;
    }
  }

  await adminSupabase
    .from('meta_channels')
    .update({
      last_synced_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  const { data, error } = await adminSupabase
    .from('meta_templates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapTemplate(row as Record<string, unknown>));
}

function getTemplateComponents(raw: Record<string, unknown> | null | undefined) {
  const components = raw?.components;

  return Array.isArray(components)
    ? components.filter((component): component is Record<string, unknown> => Boolean(component) && typeof component === 'object' && !Array.isArray(component))
    : [];
}

function normalizeTemplateSnapshot(
  raw: Record<string, unknown> | null | undefined,
  fallback?: { name?: string | null; language?: string | null },
) {
  const components = getTemplateComponents(raw);

  if (components.length === 0 && !fallback?.name) {
    return null;
  }

  return {
    name: typeof raw?.name === 'string' ? raw.name : fallback?.name || null,
    language: typeof raw?.language === 'string' ? raw.language : fallback?.language || null,
    components,
  };
}

function getTemplatePreviewText(
  snapshot: ReturnType<typeof normalizeTemplateSnapshot>,
  fallbackName?: string | null,
) {
  const bodyComponent = snapshot?.components.find((component) => component.type === 'BODY') || null;
  const headerComponent = snapshot?.components.find((component) => component.type === 'HEADER') || null;
  const bodyText = typeof bodyComponent?.text === 'string' ? bodyComponent.text.trim() : '';
  const headerText = typeof headerComponent?.text === 'string' ? headerComponent.text.trim() : '';

  if (bodyText) {
    return bodyText.replace(/\s+/g, ' ').slice(0, 140);
  }

  if (headerText) {
    return headerText.replace(/\s+/g, ' ').slice(0, 140);
  }

  return fallbackName ? `Template: ${fallbackName}` : 'Template message';
}

async function getStoredTemplateSnapshot(userId: string, templateName: string, language: string) {
  const templateRecord = await getStoredTemplateRecord(userId, templateName, language);

  if (!templateRecord) {
    return null;
  }

  return normalizeTemplateSnapshot(templateRecord.raw, {
    name: templateRecord.name,
    language: templateRecord.language,
  });
}

async function getStoredTemplateRecord(userId: string, templateName: string, language: string) {
  const { data, error } = await adminSupabase
    .from('meta_templates')
    .select('template_name, language, category, status, raw')
    .eq('user_id', userId)
    .eq('template_name', templateName)
    .eq('language', language)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    name: String(data.template_name),
    language: String(data.language || language),
    category: normalizeOptionalString(data.category)?.toUpperCase() || null,
    status: normalizeOptionalString(data.status)?.toUpperCase() || null,
    raw: isRecord(data.raw) ? (data.raw as Record<string, unknown>) : {},
  };
}

type TemplateMediaHeaderType = 'image' | 'video' | 'document';

function getTemplateMediaHeaderType(raw: Record<string, unknown> | null | undefined): TemplateMediaHeaderType | null {
  const headerComponent = getTemplateComponents(raw).find((component) => {
    return normalizeOptionalString(component.type)?.toUpperCase() === 'HEADER';
  });
  const format = normalizeOptionalString(headerComponent?.format)?.toUpperCase();

  if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
    return format.toLowerCase() as TemplateMediaHeaderType;
  }

  return null;
}

function getTemplateFlowButton(raw: Record<string, unknown> | null | undefined) {
  const buttonsComponent = getTemplateComponents(raw).find((component) => {
    return normalizeOptionalString(component.type)?.toUpperCase() === 'BUTTONS';
  });
  const buttons = Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons : [];
  const index = buttons.findIndex((button) => {
    return isRecord(button) && normalizeOptionalString(button.type)?.toUpperCase() === 'FLOW';
  });

  if (index < 0 || !isRecord(buttons[index])) {
    return null;
  }

  return {
    index: String(index),
    button: buttons[index] as Record<string, unknown>,
  };
}

function getTemplateFlowButtonIndex(raw: Record<string, unknown> | null | undefined) {
  return getTemplateFlowButton(raw)?.index || null;
}

function templateMessageComponentHasParameters(component: Record<string, unknown> | null | undefined) {
  return Array.isArray(component?.parameters) && component.parameters.filter(isRecord).length > 0;
}

function getTemplateMessageComponent(
  components: Array<Record<string, unknown>>,
  type: string,
  subType?: string,
) {
  const normalizedType = type.toLowerCase();
  const normalizedSubType = subType?.toLowerCase();

  return components.find((component) => {
    const componentType = normalizeOptionalString(component.type)?.toLowerCase();

    if (componentType !== normalizedType) {
      return false;
    }

    if (!normalizedSubType) {
      return true;
    }

    return normalizeOptionalString(component.sub_type)?.toLowerCase() === normalizedSubType;
  }) || null;
}

function removeTemplateMessageComponents(
  components: Array<Record<string, unknown>>,
  type: string,
  subType?: string,
) {
  const normalizedType = type.toLowerCase();
  const normalizedSubType = subType?.toLowerCase();

  return components.filter((component) => {
    const componentType = normalizeOptionalString(component.type)?.toLowerCase();

    if (componentType !== normalizedType) {
      return true;
    }

    if (!normalizedSubType) {
      return false;
    }

    return normalizeOptionalString(component.sub_type)?.toLowerCase() !== normalizedSubType;
  });
}

function buildTemplateMediaHeaderComponent(
  headerType: TemplateMediaHeaderType,
  preview: TemplateHeaderMediaPreview,
) {
  const mediaObject: Record<string, unknown> = {
    link: preview.url,
  };

  if (headerType === 'document' && preview.fileName) {
    mediaObject.filename = preview.fileName;
  }

  return {
    type: 'header',
    parameters: [
      {
        type: headerType,
        [headerType]: mediaObject,
      },
    ],
  };
}

function getTemplateComponentByType(
  raw: Record<string, unknown> | null | undefined,
  type: string,
) {
  const normalizedType = type.toUpperCase();
  return getTemplateComponents(raw).find((component) => {
    return normalizeOptionalString(component.type)?.toUpperCase() === normalizedType;
  }) || null;
}

function getSortedTemplateVariableIndexes(text: string | null | undefined) {
  const matches = typeof text === 'string' ? text.match(/\{\{\s*(\d+)\s*\}\}/g) || [] : [];
  return Array.from(
    new Set(
      matches
        .map((match) => Number(match.replace(/\D/g, '')))
        .filter((index) => Number.isInteger(index) && index > 0),
    ),
  ).sort((left, right) => left - right);
}

function normalizeTemplateExampleString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeOptionalString(value);
}

function getTemplateHeaderTextExamples(component: Record<string, unknown>) {
  const example = isRecord(component.example) ? component.example : null;
  const headerText = Array.isArray(example?.header_text) ? example.header_text : [];

  return headerText
    .map((value) => normalizeTemplateExampleString(value))
    .filter((value): value is string => Boolean(value));
}

function getTemplateBodyTextExamples(component: Record<string, unknown>) {
  const example = isRecord(component.example) ? component.example : null;
  const bodyText = Array.isArray(example?.body_text) ? example.body_text : [];
  const firstExampleSet = Array.isArray(bodyText[0]) ? bodyText[0] : bodyText;

  return firstExampleSet
    .map((value) => normalizeTemplateExampleString(value))
    .filter((value): value is string => Boolean(value));
}

function buildTextParameterComponent(
  type: 'header' | 'body',
  variableIndexes: number[],
  examples: string[],
) {
  if (variableIndexes.length === 0) {
    return null;
  }

  return {
    type,
    parameters: variableIndexes.map((variableIndex, parameterIndex) => ({
      type: 'text',
      text: examples[parameterIndex] || `Sample ${variableIndex}`,
    })),
  };
}

async function addStoredTemplateTextParameterComponents(
  userId: string,
  input: SendTemplateMessageInput,
) {
  const components = Array.isArray(input.components)
    ? input.components.filter(isRecord)
    : [];
  const templateRecord = await getStoredTemplateRecord(userId, input.templateName, input.language);

  if (!templateRecord) {
    return components;
  }

  const parameterComponents: Array<Record<string, unknown>> = [];
  let remainingComponents = components;

  const headerComponent = getTemplateComponentByType(templateRecord.raw, 'HEADER');
  const headerText =
    normalizeOptionalString(headerComponent?.format)?.toUpperCase() === 'TEXT'
      ? normalizeOptionalString(headerComponent?.text)
      : null;
  const headerVariableIndexes = getSortedTemplateVariableIndexes(headerText);

  if (headerVariableIndexes.length > 0) {
    const existingHeaderComponent = getTemplateMessageComponent(components, 'header');

    if (!templateMessageComponentHasParameters(existingHeaderComponent)) {
      const headerParameters = buildTextParameterComponent(
        'header',
        headerVariableIndexes,
        headerComponent ? getTemplateHeaderTextExamples(headerComponent) : [],
      );

      remainingComponents = removeTemplateMessageComponents(remainingComponents, 'header');
      parameterComponents.push(headerParameters);
    }
  }

  const bodyComponent = getTemplateComponentByType(templateRecord.raw, 'BODY');
  const bodyVariableIndexes = getSortedTemplateVariableIndexes(normalizeOptionalString(bodyComponent?.text));

  if (bodyVariableIndexes.length > 0) {
    const existingBodyComponent = getTemplateMessageComponent(components, 'body');

    if (!templateMessageComponentHasParameters(existingBodyComponent)) {
      const bodyParameters = buildTextParameterComponent(
        'body',
        bodyVariableIndexes,
        bodyComponent ? getTemplateBodyTextExamples(bodyComponent) : [],
      );

      remainingComponents = removeTemplateMessageComponents(remainingComponents, 'body');
      parameterComponents.push(bodyParameters);
    }
  }

  return [...parameterComponents, ...remainingComponents];
}

async function addStoredTemplateHeaderMediaComponent(
  userId: string,
  input: SendTemplateMessageInput,
) {
  const components = Array.isArray(input.components)
    ? input.components.filter(isRecord)
    : [];

  const existingHeaderComponent = getTemplateMessageComponent(components, 'header');

  if (templateMessageComponentHasParameters(existingHeaderComponent)) {
    return components;
  }

  const templateRecord = await getStoredTemplateRecord(userId, input.templateName, input.language);
  const headerType = getTemplateMediaHeaderType(templateRecord?.raw);

  if (!headerType) {
    return components;
  }

  const headerMediaPreview = getTemplateHeaderMediaPreviewFromRaw(templateRecord?.raw);

  if (!headerMediaPreview) {
    throw new Error(
      `The selected WhatsApp template has a ${headerType.toUpperCase()} header, but no reusable header media file is stored for sending.`,
    );
  }

  const durableHeaderMediaPreview = await migrateTemplateHeaderMediaPreviewToDurableUrl(
    userId,
    input.templateName,
    input.language,
    headerMediaPreview,
  );

  await ensureTemplateHeaderMediaPreviewIsAvailable(durableHeaderMediaPreview);

  return [
    buildTemplateMediaHeaderComponent(headerType, durableHeaderMediaPreview),
    ...removeTemplateMessageComponents(components, 'header'),
  ];
}

function buildTemplateFlowButtonComponent(index: string, input: SendTemplateMessageInput, defaultFlowToken: string) {
  const action: Record<string, unknown> = {
    flow_token: normalizeOptionalString(input.flowToken) || defaultFlowToken || 'unused',
  };

  if (isRecord(input.flowActionData) && Object.keys(input.flowActionData).length > 0) {
    action.flow_action_data = input.flowActionData;
  }

  return {
    type: 'button',
    sub_type: 'flow',
    index,
    parameters: [
      {
        type: 'action',
        action,
      },
    ],
  };
}

async function getDefaultTemplateFlowToken(
  userId: string,
  templateRecord: Awaited<ReturnType<typeof getStoredTemplateRecord>>,
) {
  if (!templateRecord) {
    return 'unused';
  }

  const flowButton = getTemplateFlowButton(templateRecord.raw);
  const button = flowButton?.button;

  if (!button) {
    return 'unused';
  }

  const flowId = normalizeOptionalIdentifier(button.flow_id);
  if (flowId) {
    const flowRow = await findStoredFlowRowByLocalOrMetaId(userId, flowId);
    return flowRow ? `flow:${String(flowRow.id)}` : `meta-flow:${flowId}`;
  }

  const flowName = normalizeOptionalString(button.flow_name);
  if (flowName) {
    const flowRow = await findStoredFlowRowByName(userId, flowName);
    return flowRow ? `flow:${String(flowRow.id)}` : `flow-name:${encodeURIComponent(flowName)}`;
  }

  return `template:${templateRecord.name}:${templateRecord.language}:flow:${flowButton.index}`;
}

async function addStoredTemplateFlowButtonComponent(
  userId: string,
  input: SendTemplateMessageInput,
) {
  const components = Array.isArray(input.components)
    ? input.components.filter(isRecord)
    : [];

  const existingFlowButtonComponent = getTemplateMessageComponent(components, 'button', 'flow');

  if (templateMessageComponentHasParameters(existingFlowButtonComponent)) {
    return components;
  }

  const templateRecord = await getStoredTemplateRecord(userId, input.templateName, input.language);
  const flowButtonIndex = getTemplateFlowButtonIndex(templateRecord?.raw);

  if (flowButtonIndex === null) {
    return components;
  }

  const defaultFlowToken = await getDefaultTemplateFlowToken(userId, templateRecord);

  return [
    ...removeTemplateMessageComponents(components, 'button', 'flow'),
    buildTemplateFlowButtonComponent(flowButtonIndex, input, defaultFlowToken),
  ];
}

async function buildOutgoingTemplatePayloadWithStoredDefaults(
  userId: string,
  input: SendTemplateMessageInput,
): Promise<WhatsAppMessagePayload> {
  const componentsWithTextParameters = await addStoredTemplateTextParameterComponents(userId, input);
  const componentsWithHeader = await addStoredTemplateHeaderMediaComponent(userId, {
    ...input,
    components: componentsWithTextParameters,
  });
  const componentsWithFlowButton = await addStoredTemplateFlowButtonComponent(userId, {
    ...input,
    components: componentsWithHeader,
  });

  return buildOutgoingTemplatePayload({
    ...input,
    components: componentsWithFlowButton,
  });
}

function getConversationThreadActivityTimestamp(row: Record<string, unknown>) {
  const timestamp =
    normalizeOptionalString(row.last_message_at) ||
    normalizeOptionalString(row.updated_at) ||
    normalizeOptionalString(row.created_at);

  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickConversationThreadRow(rows: Record<string, unknown>[], canonicalPhone: string) {
  return [...rows].sort((left, right) => {
    const leftIsCanonical = String(left.contact_wa_id || '') === canonicalPhone ? 1 : 0;
    const rightIsCanonical = String(right.contact_wa_id || '') === canonicalPhone ? 1 : 0;

    if (leftIsCanonical !== rightIsCanonical) {
      return rightIsCanonical - leftIsCanonical;
    }

    const timeDiff =
      getConversationThreadActivityTimestamp(right) - getConversationThreadActivityTimestamp(left);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return String(right.id || '').localeCompare(String(left.id || ''));
  })[0];
}

function pickConversationThreadString(
  rows: Record<string, unknown>[],
  key: string,
  primaryRow: Record<string, unknown>,
) {
  const preferred = normalizeOptionalString(primaryRow[key]);

  if (preferred) {
    return preferred;
  }

  for (const row of rows) {
    const value = normalizeOptionalString(row[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

async function findConversationThreadRowsByIdentity(userId: string, contactIdentity: unknown) {
  const variants = buildContactIdentityVariants(contactIdentity);

  if (variants.length === 0) {
    return [] as Record<string, unknown>[];
  }

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .in('contact_wa_id', variants);

  if (error) {
    throw error;
  }

  return (data || []) as Record<string, unknown>[];
}

async function findMarketingOptedOutContact(args: {
  userId: string;
  to: string;
  threadId?: string | null;
}) {
  const rows: Record<string, unknown>[] = [];

  if (args.threadId) {
    const { data, error } = await adminSupabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', args.userId)
      .eq('id', args.threadId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      rows.push(data as Record<string, unknown>);
    }
  }

  const recipientRows = await findConversationThreadRowsByIdentity(args.userId, args.to);
  rows.push(...recipientRows);

  return rows.find((row) => Boolean(row.marketing_opted_out)) || null;
}

async function assertMarketingTemplateSendAllowed(args: {
  userId: string;
  to: string;
  templateName: string;
  language: string;
  threadId?: string | null;
}) {
  const templateRecord = await getStoredTemplateRecord(args.userId, args.templateName, args.language);

  if (templateRecord?.category !== 'MARKETING') {
    return;
  }

  const optedOutContact = await findMarketingOptedOutContact({
    userId: args.userId,
    to: args.to,
    threadId: args.threadId,
  });

  if (optedOutContact) {
    const contactLabel =
      normalizeOptionalString(optedOutContact.contact_name) ||
      normalizeOptionalString(optedOutContact.display_phone) ||
      args.to;
    throw new Error(`${contactLabel} has opted out of WhatsApp marketing campaigns.`);
  }
}

async function consolidateConversationThreadRows(args: {
  userId: string;
  rows: Record<string, unknown>[];
  canonicalPhone: string;
}) {
  const uniqueRows = Array.from(
    new Map(args.rows.map((row) => [String(row.id || ''), row])).values(),
  );

  if (uniqueRows.length === 0) {
    return null;
  }

  const primaryRow = pickConversationThreadRow(uniqueRows, args.canonicalPhone);
  const duplicateRows = uniqueRows.filter((row) => String(row.id || '') !== String(primaryRow.id || ''));
  const duplicateIds = duplicateRows.map((row) => String(row.id || '')).filter(Boolean);
  const latestMessageRow =
    [...uniqueRows]
      .filter((row) => normalizeOptionalString(row.last_message_at))
      .sort((left, right) => {
        const leftTimestamp = Date.parse(normalizeOptionalString(left.last_message_at) || '');
        const rightTimestamp = Date.parse(normalizeOptionalString(right.last_message_at) || '');
        return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp) - (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
      })[0] || primaryRow;
  const mergedLabels = normalizeLabels(
    uniqueRows.flatMap((row) => (Array.isArray(row.labels) ? (row.labels as unknown[]) : [])),
  );
  const mergedAttributes = uniqueRows.reduce<Record<string, unknown>>((attributes, row) => {
    return isRecord(row.attributes)
      ? {
          ...attributes,
          ...(row.attributes as Record<string, unknown>),
        }
      : attributes;
  }, {});
  const mergedUnreadCount = uniqueRows.reduce((total, row) => total + Number(row.unread_count || 0), 0);
  const payload = {
    meta_channel_id: pickConversationThreadString(uniqueRows, 'meta_channel_id', primaryRow),
    contact_wa_id: args.canonicalPhone,
    contact_name: pickConversationThreadString(uniqueRows, 'contact_name', primaryRow),
    display_phone: `+${args.canonicalPhone}`,
    email: pickConversationThreadString(uniqueRows, 'email', primaryRow),
    source: pickConversationThreadString(uniqueRows, 'source', primaryRow),
    remark: pickConversationThreadString(uniqueRows, 'remark', primaryRow),
    attributes: mergedAttributes,
    avatar_url: pickConversationThreadString(uniqueRows, 'avatar_url', primaryRow),
    status: normalizeStatus(
      (pickConversationThreadString(uniqueRows, 'status', primaryRow) || primaryRow.status) as
        | string
        | null,
    ),
    priority: normalizePriority(
      (pickConversationThreadString(uniqueRows, 'priority', primaryRow) || primaryRow.priority) as
        | string
        | null,
    ),
    labels: mergedLabels,
    marketing_opted_out: uniqueRows.some((row) => Boolean(row.marketing_opted_out)),
    owner_name: pickConversationThreadString(uniqueRows, 'owner_name', primaryRow),
    last_message_text: pickConversationThreadString(uniqueRows, 'last_message_text', latestMessageRow),
    last_message_at: normalizeOptionalString(latestMessageRow.last_message_at),
    unread_count: mergedUnreadCount,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await adminSupabase
    .from('conversation_threads')
    .update(payload)
    .eq('user_id', args.userId)
    .eq('id', String(primaryRow.id));

  if (updateError) {
    throw updateError;
  }

  if (duplicateIds.length > 0) {
    const { error: reassignMessagesError } = await adminSupabase
      .from('conversation_messages')
      .update({ thread_id: String(primaryRow.id) })
      .eq('user_id', args.userId)
      .in('thread_id', duplicateIds);

    if (reassignMessagesError) {
      throw reassignMessagesError;
    }

    const { error: deleteThreadsError } = await adminSupabase
      .from('conversation_threads')
      .delete()
      .eq('user_id', args.userId)
      .in('id', duplicateIds);

    if (deleteThreadsError) {
      throw deleteThreadsError;
    }
  }

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', args.userId)
    .eq('id', String(primaryRow.id))
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function ensureConversationThreadPhoneConsistency(
  userId: string,
  rows: Record<string, unknown>[],
) {
  const rowsByPhone = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    if (isExternalMessagingThreadRow(row)) {
      continue;
    }

    const canonicalPhone = normalizePhoneLike(row.contact_wa_id);

    if (!canonicalPhone) {
      continue;
    }

    const currentRows = rowsByPhone.get(canonicalPhone) || [];
    currentRows.push(row);
    rowsByPhone.set(canonicalPhone, currentRows);
  }

  let changed = false;

  for (const [canonicalPhone, groupedRows] of rowsByPhone.entries()) {
    const expectedDisplay = `+${canonicalPhone}`;
    const needsConsolidation =
      groupedRows.length > 1 ||
      groupedRows.some((row) => {
        const currentContactWaId = String(row.contact_wa_id || '');
        const currentDisplayPhone = formatContactIdentity(row.display_phone) || null;

        return currentContactWaId !== canonicalPhone || currentDisplayPhone !== expectedDisplay;
      });

    if (!needsConsolidation) {
      continue;
    }

    await consolidateConversationThreadRows({
      userId,
      rows: groupedRows,
      canonicalPhone,
    });
    changed = true;
  }

  return changed;
}

async function upsertThread(args: {
  userId: string;
  metaChannelId: string | null;
  contactWaId: string;
  contactName?: string | null;
  username?: string | null;
  displayPhone?: string | null;
  email?: string | null;
  source?: string | null;
  remark?: string | null;
  avatarUrl?: string | null;
  status?: ConversationThread['status'];
  priority?: ConversationThread['priority'];
  labels?: string[];
  ownerName?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadDelta?: number;
}) {
  const contactWaId = normalizeContactIdentity(args.contactWaId);

  if (!contactWaId) {
    throw new Error('contactWaId is required.');
  }

  const canonicalPhone = normalizePhoneLike(contactWaId);
  let existingRow: Record<string, unknown> | null = null;

  if (canonicalPhone) {
    const matchingRows = await findConversationThreadRowsByIdentity(args.userId, canonicalPhone);
    existingRow =
      matchingRows.length > 0
        ? await consolidateConversationThreadRows({
            userId: args.userId,
            rows: matchingRows,
            canonicalPhone,
          })
        : null;
  } else {
    const existing = await adminSupabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', args.userId)
      .eq('contact_wa_id', contactWaId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    existingRow = (existing.data as Record<string, unknown> | null) || null;
  }

  const currentUnread = existingRow?.unread_count ? Number(existingRow.unread_count) : 0;
  const explicitDisplayPhone =
    args.displayPhone !== undefined
      ? formatContactIdentity(args.displayPhone) ?? normalizeOptionalString(args.displayPhone)
      : undefined;
  const payload = {
    meta_channel_id: args.metaChannelId ?? existingRow?.meta_channel_id ?? null,
    contact_wa_id: contactWaId,
    contact_name: args.contactName ?? existingRow?.contact_name ?? null,
    username: args.username ?? existingRow?.username ?? null,
    display_phone:
      explicitDisplayPhone ??
      (canonicalPhone ? `+${canonicalPhone}` : normalizeOptionalString(existingRow?.display_phone)) ??
      null,
    email: args.email ?? existingRow?.email ?? null,
    source: args.source ?? existingRow?.source ?? null,
    remark: args.remark ?? existingRow?.remark ?? null,
    avatar_url: args.avatarUrl ?? existingRow?.avatar_url ?? null,
    status:
      args.status !== undefined
        ? normalizeStatus(args.status)
        : normalizeStatus((existingRow?.status as string | null | undefined) ?? null),
    priority:
      args.priority ?? normalizePriority((existingRow?.priority as string | null | undefined) ?? null),
    labels: args.labels !== undefined ? normalizeLabels(args.labels) : normalizeLabels(existingRow?.labels),
    marketing_opted_out: Boolean(existingRow?.marketing_opted_out),
    owner_name: args.ownerName ?? existingRow?.owner_name ?? null,
    last_message_text: args.lastMessageText ?? existingRow?.last_message_text ?? null,
    last_message_at: args.lastMessageAt ?? existingRow?.last_message_at ?? null,
    unread_count: Math.max(0, currentUnread + (args.unreadDelta || 0)),
    updated_at: new Date().toISOString(),
  };

  const query = adminSupabase.from('conversation_threads');
  const result = existingRow
    ? await query
        .update(payload)
        .eq('user_id', args.userId)
        .eq('id', String(existingRow.id))
        .select('*')
        .single()
    : await query
        .insert({
          user_id: args.userId,
          ...payload,
        })
        .select('*')
        .single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  const thread = mapThread(data as Record<string, unknown>);

  if (!existingRow) {
    void dispatchDeveloperWebhookEvent(args.userId, 'conversation.created', {
      conversation: thread,
    }).catch((error) => {
      console.error('Failed to dispatch conversation.created webhook:', error);
    });
  }

  return thread;
}

async function createContact(userId: string, input: ContactUpsertInput) {
  const contactWaId = normalizePhoneLike(input.contactWaId);

  if (!contactWaId) {
    throw new Error('contactWaId is required.');
  }

  const [matchingRows, channelResult] = await Promise.all([
    findConversationThreadRowsByIdentity(userId, contactWaId),
    adminSupabase.from('meta_channels').select('id').eq('user_id', userId).maybeSingle(),
  ]);

  if (channelResult.error) {
    throw channelResult.error;
  }

  const existing =
    matchingRows.length > 0
      ? await consolidateConversationThreadRows({
          userId,
          rows: matchingRows,
          canonicalPhone: contactWaId,
        })
      : null;
  const payload = {
    meta_channel_id: existing?.meta_channel_id || channelResult.data?.id || null,
    contact_wa_id: contactWaId,
    contact_name: normalizeOptionalString(input.contactName) ?? existing?.contact_name ?? null,
    display_phone: formatContactIdentity(input.displayPhone) ?? existing?.display_phone ?? `+${contactWaId}`,
    email: normalizeOptionalString(input.email) ?? existing?.email ?? null,
    source: normalizeOptionalString(input.source) ?? existing?.source ?? 'Manual',
    remark: normalizeOptionalString(input.remark) ?? existing?.remark ?? null,
    avatar_url: normalizeOptionalString(input.avatarUrl) ?? existing?.avatar_url ?? null,
    status: normalizeStatus(input.status ?? (existing?.status as string | null | undefined)),
    priority: normalizePriority(input.priority ?? (existing?.priority as string | null | undefined)),
    labels: input.labels !== undefined ? normalizeLabels(input.labels) : existing?.labels ?? [],
    marketing_opted_out:
      typeof input.marketingOptedOut === 'boolean'
        ? input.marketingOptedOut
        : Boolean(existing?.marketing_opted_out),
    owner_name: normalizeOptionalString(input.ownerName) ?? existing?.owner_name ?? null,
    last_message_text: existing?.last_message_text ?? null,
    last_message_at: existing?.last_message_at ?? null,
    unread_count: Number(existing?.unread_count || 0),
    updated_at: new Date().toISOString(),
  };

  const query = adminSupabase.from('conversation_threads');
  const result = existing
    ? await query
        .update(payload)
        .eq('user_id', userId)
        .eq('id', String(existing.id))
        .select('*')
        .single()
    : await query
        .insert({
          user_id: userId,
          ...payload,
        })
        .select('*')
        .single();
  const { data, error } = result;

  if (error) {
    throw error;
  }

  const contact = mapThread(data as Record<string, unknown>);

  if (!existing) {
    const contactLabel = contact.contactName || contact.displayPhone || `+${contactWaId}`;
    await createUserNotification({
      userId,
      type: 'lead_created',
      title: 'New lead added to CRM',
      body: `${contactLabel} has been added to your lead list.`,
      targetPath: '/dashboard/crm/leads',
      metadata: {
        threadId: contact.id,
        source: contact.source,
        contactWaId: contact.contactWaId,
      },
      dedupeKey: `lead-created:contact:${contact.id}`,
    });

    try {
      await processAutomationRulesForLeadCreated({
        userId,
        contact,
      });
    } catch (error) {
      console.error('Lead-created automation rule processing failed:', error);
    }

    void dispatchDeveloperWebhookEvent(userId, 'contact.created', {
      contact,
    }).catch((error) => {
      console.error('Failed to dispatch contact.created webhook:', error);
    });
  }

  return contact;
}

async function updateContact(userId: string, threadId: string, input: ContactUpdateInput) {
  const existingResult = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (!existingResult.data) {
    throw new Error('Contact not found.');
  }

  const existing = existingResult.data as Record<string, unknown>;
  const nextContactWaId =
    input.displayPhone !== undefined
      ? normalizeContactIdentity(input.displayPhone) || normalizeContactIdentity(existing.contact_wa_id)
      : normalizeContactIdentity(existing.contact_wa_id);

  if (!nextContactWaId) {
    throw new Error('Contact number is required.');
  }

  const canonicalPhone = normalizePhoneLike(nextContactWaId);
  let targetRow = existing;

  if (canonicalPhone) {
    const matchingRows = await findConversationThreadRowsByIdentity(userId, canonicalPhone);
    const rowsToMerge = Array.from(
      new Map([...matchingRows, existing].map((row) => [String(row.id || ''), row])).values(),
    );

    targetRow =
      (await consolidateConversationThreadRows({
        userId,
        rows: rowsToMerge,
        canonicalPhone,
      })) || existing;
  }

  const payload = {
    contact_wa_id: nextContactWaId,
    contact_name:
      input.contactName !== undefined
        ? normalizeOptionalString(input.contactName)
        : targetRow.contact_name ?? null,
    display_phone:
      input.displayPhone !== undefined
        ? formatContactIdentity(input.displayPhone) ??
          (canonicalPhone ? `+${canonicalPhone}` : formatContactIdentity(targetRow.display_phone)) ??
          normalizeOptionalString(targetRow.display_phone) ??
          null
        : formatContactIdentity(targetRow.display_phone) ??
          (canonicalPhone ? `+${canonicalPhone}` : normalizeOptionalString(targetRow.display_phone)) ??
          null,
    email:
      input.email !== undefined
        ? normalizeOptionalString(input.email)
        : targetRow.email ?? null,
    source:
      input.source !== undefined
        ? normalizeOptionalString(input.source)
        : targetRow.source ?? null,
    remark:
      input.remark !== undefined
        ? normalizeOptionalString(input.remark)
        : targetRow.remark ?? null,
    avatar_url:
      input.avatarUrl !== undefined
        ? normalizeOptionalString(input.avatarUrl)
        : targetRow.avatar_url ?? null,
    status:
      input.status !== undefined
        ? normalizeStatus(input.status)
        : normalizeStatus(targetRow.status as string | null | undefined),
    priority:
      input.priority !== undefined
        ? normalizePriority(input.priority)
        : normalizePriority(targetRow.priority as string | null | undefined),
    labels: input.labels !== undefined ? normalizeLabels(input.labels) : normalizeLabels(targetRow.labels),
    marketing_opted_out:
      typeof input.marketingOptedOut === 'boolean'
        ? input.marketingOptedOut
        : Boolean(targetRow.marketing_opted_out),
    owner_name:
      input.ownerName !== undefined
        ? normalizeOptionalString(input.ownerName)
        : targetRow.owner_name ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', String(targetRow.id))
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapThread(data as Record<string, unknown>);
}

async function insertMessage(args: {
  userId: string;
  threadId: string;
  waMessageId?: string | null;
  direction: ConversationMessage['direction'];
  messageType: string;
  body?: string | null;
  senderName?: string | null;
  senderWaId?: string | null;
  recipientWaId?: string | null;
  templateName?: string | null;
  status?: string | null;
  raw?: Record<string, unknown>;
}) {
  const payload = {
    user_id: args.userId,
    thread_id: args.threadId,
    wa_message_id: args.waMessageId || null,
    direction: args.direction,
    message_type: args.messageType,
    body: args.body || null,
    sender_name: args.senderName || null,
    sender_wa_id: args.senderWaId || null,
    recipient_wa_id: args.recipientWaId || null,
    template_name: args.templateName || null,
    status: args.status || null,
    raw: args.raw || {},
  };

  if (args.waMessageId) {
    const existing = await adminSupabase
      .from('conversation_messages')
      .select('*')
      .eq('user_id', args.userId)
      .eq('wa_message_id', args.waMessageId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      return mapMessage(existing.data as Record<string, unknown>);
    }
  }

  const { data, error } = await adminSupabase
    .from('conversation_messages')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const message = mapMessage(data as Record<string, unknown>);

  if (message.direction === 'inbound') {
    void dispatchDeveloperWebhookEvent(args.userId, 'message.received', {
      message,
      threadId: args.threadId,
    }).catch((error) => {
      console.error('Failed to dispatch message.received webhook:', error);
    });
  }

  return message;
}

function mergeWhatsAppStatusPayloadIntoRaw(
  raw: unknown,
  statusRecord: Record<string, unknown>,
) {
  const currentRaw = isRecord(raw) ? raw : {};
  const receivedAt = new Date().toISOString();
  const nextStatusRecord = {
    ...statusRecord,
    received_at: receivedAt,
  };
  const previousHistory = Array.isArray(currentRaw.whatsapp_status_history)
    ? currentRaw.whatsapp_status_history.filter(isRecord)
    : [];
  const nextHistory = [...previousHistory, nextStatusRecord].slice(-10);

  return {
    ...currentRaw,
    whatsapp_status: nextStatusRecord,
    whatsapp_status_history: nextHistory,
  };
}

async function updateOutgoingWhatsAppMessageStatus(args: {
  userId: string;
  statusRecord: Record<string, unknown>;
}) {
  const messageId = normalizeOptionalString(args.statusRecord.id);

  if (!messageId) {
    return;
  }

  const result = await adminSupabase
    .from('conversation_messages')
    .select('*')
    .eq('user_id', args.userId)
    .eq('wa_message_id', messageId);

  if (result.error) {
    throw result.error;
  }

  const nextStatus = normalizeOptionalString(args.statusRecord.status) || null;
  const errors = Array.isArray(args.statusRecord.errors)
    ? args.statusRecord.errors.filter(isRecord)
    : [];
  const firstError = errors[0] || null;
  const firstErrorData = isRecord(firstError?.error_data)
    ? (firstError.error_data as Record<string, unknown>)
    : null;

  console.info('WhatsApp message status webhook:', {
    messageId,
    status: nextStatus,
    errorCode: firstError?.code || null,
    errorTitle: normalizeOptionalString(firstError?.title) || null,
    errorMessage:
      normalizeOptionalString(firstErrorData?.details) ||
      normalizeOptionalString(firstError?.message) ||
      null,
    matchedRows: result.data?.length || 0,
  });

  if (nextStatus === 'failed') {
    console.error('WhatsApp message delivery failed:', {
      messageId,
      matchedRows: (result.data || []).map((row) => ({
        id: String(row.id || ''),
        templateName: normalizeOptionalString(row.template_name),
        previousStatus: normalizeOptionalString(row.status),
      })),
      errorCode: firstError?.code || null,
      errorTitle: normalizeOptionalString(firstError?.title) || null,
      errorMessage:
        normalizeOptionalString(firstErrorData?.details) ||
        normalizeOptionalString(firstError?.message) ||
        null,
      errors,
      statusRecord: args.statusRecord,
    });
  }

  for (const row of (result.data || []) as Array<Record<string, unknown>>) {
    const previousStatus = normalizeOptionalString(row.status);
    const { data, error } = await adminSupabase
      .from('conversation_messages')
      .update({
        status: nextStatus,
        raw: mergeWhatsAppStatusPayloadIntoRaw(row.raw, args.statusRecord),
      })
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (nextStatus && nextStatus !== previousStatus) {
      const eventName =
        nextStatus === 'read'
          ? 'message.read'
          : nextStatus === 'delivered'
            ? 'message.delivered'
            : nextStatus === 'failed'
              ? 'message.failed'
              : null;

      if (eventName) {
        const message = mapMessage(data as Record<string, unknown>);
        void dispatchDeveloperWebhookEvent(args.userId, eventName, {
          message,
          statusRecord: args.statusRecord,
        }).catch((error) => {
          console.error(`Failed to dispatch ${eventName} webhook:`, error);
        });
      }
    }
  }
}

function getOutgoingInteractivePreviewText(payload: WhatsAppMessagePayload) {
  if (payload.type !== 'interactive') {
    return null;
  }

  const bodyText = normalizeOptionalString(payload.interactive.body?.text);
  const headerText =
    payload.interactive.header?.type === 'text'
      ? normalizeOptionalString(payload.interactive.header.text)
      : null;
  const footerText = normalizeOptionalString(payload.interactive.footer?.text);

  return bodyText || headerText || footerText || 'Interactive message';
}

function getOutgoingContactsPreviewText(payload: WhatsAppMessagePayload) {
  if (payload.type !== 'contacts' || payload.contacts.length === 0) {
    return 'Contact card';
  }

  const firstContact = payload.contacts[0];
  const formattedName = normalizeOptionalString(firstContact.name?.formatted_name);
  const phone = normalizeOptionalString(firstContact.phones?.[0]?.phone);
  const email = normalizeOptionalString(firstContact.emails?.[0]?.email);

  return formattedName
    ? `Contact card: ${formattedName}`
    : phone
      ? `Contact card: ${phone}`
      : email
        ? `Contact card: ${email}`
        : 'Contact card';
}

async function describeOutgoingWhatsAppMessage(userId: string, payload: WhatsAppMessagePayload) {
  const rawBase = payload.context?.message_id
    ? {
        context: payload.context,
      }
    : {};

  switch (payload.type) {
    case 'text':
      return {
        messageType: 'text',
        body: payload.text.body,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'text',
          text: payload.text,
        },
      };
    case 'image':
      return {
        messageType: 'image',
        body: payload.image.caption || 'Image attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'image',
          image: payload.image,
        },
      };
    case 'video':
      return {
        messageType: 'video',
        body: payload.video.caption || 'Video attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'video',
          video: payload.video,
        },
      };
    case 'audio':
      return {
        messageType: 'audio',
        body: 'Audio attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'audio',
          audio: payload.audio,
        },
      };
    case 'document':
      return {
        messageType: 'document',
        body: payload.document.caption || payload.document.filename || 'Document attachment',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'document',
          document: payload.document,
        },
      };
    case 'sticker':
      return {
        messageType: 'sticker',
        body: 'Sticker',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'sticker',
          sticker: payload.sticker,
        },
      };
    case 'reaction':
      return {
        messageType: 'reaction',
        body: `Reaction: ${payload.reaction.emoji}`,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'reaction',
          reaction: payload.reaction,
        },
      };
    case 'location': {
      const locationLabel =
        normalizeOptionalString(payload.location.name) ||
        normalizeOptionalString(payload.location.address) ||
        `${payload.location.latitude}, ${payload.location.longitude}`;

      return {
        messageType: 'location',
        body: `Location: ${locationLabel}`,
        templateName: null,
        raw: {
          ...rawBase,
          type: 'location',
          location: payload.location,
        },
      };
    }
    case 'contacts':
      return {
        messageType: 'contacts',
        body: getOutgoingContactsPreviewText(payload),
        templateName: null,
        raw: {
          ...rawBase,
          type: 'contacts',
          contacts: payload.contacts,
        },
      };
    case 'interactive':
      return {
        messageType: 'interactive',
        body: getOutgoingInteractivePreviewText(payload) || 'Interactive message',
        templateName: null,
        raw: {
          ...rawBase,
          type: 'interactive',
          interactive: payload.interactive,
        },
      };
    case 'template': {
      const templateSnapshot = await getStoredTemplateSnapshot(
        userId,
        payload.template.name,
        payload.template.language.code,
      );

      return {
        messageType: 'template',
        body: getTemplatePreviewText(templateSnapshot, payload.template.name),
        templateName: payload.template.name,
        raw: {
          ...rawBase,
          type: 'template',
          template: payload.template,
          template_snapshot: templateSnapshot,
        },
      };
    }
  }
}

function getConversationThreadMessagingChannel(thread: ConversationThread) {
  const source = normalizeOptionalString(thread.source)?.toLowerCase();
  const contactIdentity = normalizeOptionalString(thread.contactWaId)?.toLowerCase() || '';

  if (source === 'messenger' || contactIdentity.startsWith('messenger:')) {
    return 'messenger';
  }

  if (source === 'instagram' || contactIdentity.startsWith('instagram:')) {
    return 'instagram';
  }

  return 'whatsapp';
}

function getThreadRecipientIdFromIdentity(thread: ConversationThread, prefix: 'messenger' | 'instagram') {
  const expectedPrefix = `${prefix}:`;
  const contactIdentity = normalizeOptionalString(thread.contactWaId);

  if (contactIdentity?.toLowerCase().startsWith(expectedPrefix)) {
    return contactIdentity.slice(expectedPrefix.length);
  }

  const displayIdentity = normalizeOptionalString(thread.displayPhone);

  if (displayIdentity && !displayIdentity.startsWith('@')) {
    return displayIdentity.startsWith(expectedPrefix)
      ? displayIdentity.slice(expectedPrefix.length)
      : displayIdentity;
  }

  return null;
}

async function sendThreadOutgoingWhatsAppMessage(args: {
  user: User;
  metaChannelId: string;
  phoneNumberId: string;
  accessToken: string;
  thread: ConversationThread;
  payload: WhatsAppMessagePayload;
  clientTempId?: string;
  status?: ConversationThread['status'];
}) {
  const payload =
    args.payload.type === 'template'
      ? {
          ...(await buildOutgoingTemplatePayloadWithStoredDefaults(args.user.id, {
            to: args.payload.to,
            templateName: args.payload.template.name,
            language: args.payload.template.language.code,
            components: args.payload.template.components,
            replyToMessageId: args.payload.context?.message_id,
          })),
          ...(args.payload.recipient_type ? { recipient_type: args.payload.recipient_type } : {}),
        }
      : args.payload;
  const remote =
    payload.type === 'template'
      ? await sendRemoteWhatsAppTemplateMessageForStoredCategory({
          userId: args.user.id,
          accessToken: args.accessToken,
          phoneNumberId: args.phoneNumberId,
          payload,
        })
      : await sendRemoteWhatsAppMessage(args.accessToken, args.phoneNumberId, payload);
  const createdAt = new Date().toISOString();
  const descriptor = await describeOutgoingWhatsAppMessage(args.user.id, payload);
  const nextThread = await upsertThread({
    userId: args.user.id,
    metaChannelId: args.metaChannelId,
    contactWaId: args.thread.contactWaId,
    contactName: args.thread.contactName,
    displayPhone: payload.to,
    status: args.status || 'Connected',
    lastMessageText: descriptor.body,
    lastMessageAt: createdAt,
    unreadDelta: 0,
  });

  const message = await insertMessage({
    userId: args.user.id,
    threadId: args.thread.id,
    waMessageId: remote.messages?.[0]?.id || null,
    direction: 'outbound',
    messageType: descriptor.messageType,
    body: descriptor.body,
    senderName: args.user.user_metadata?.full_name || null,
    senderWaId: args.phoneNumberId,
    recipientWaId: args.payload.to,
    templateName: descriptor.templateName,
    status: getRemoteWhatsAppInitialMessageStatus(remote),
    raw: {
      client_temp_id: args.clientTempId || null,
      to: payload.to,
      recipient_type: payload.recipient_type || 'individual',
      ...descriptor.raw,
      remote,
    },
  });

  return {
    remote,
    thread: nextThread,
    message,
  };
}

async function sendThreadOutgoingMessengerTextMessage(args: {
  user: User;
  channelRow: Record<string, unknown>;
  accessToken: string;
  thread: ConversationThread;
  body: string;
  clientTempId?: string;
}) {
  const pageId = normalizeOptionalIdentifier(args.channelRow.page_id);
  const recipientId = getThreadRecipientIdFromIdentity(args.thread, 'messenger');

  if (!pageId) {
    throw new Error('Messenger Page ID is missing from the connected channel.');
  }

  if (!recipientId) {
    throw new Error('This Messenger conversation is missing a recipient ID.');
  }

  const remote = await sendRemoteMessengerTextMessage({
    accessToken: args.accessToken,
    pageId,
    recipientId,
    body: args.body,
  });
  const createdAt = new Date().toISOString();
  const senderLabel =
    normalizeOptionalString(args.channelRow.page_name) ||
    normalizeOptionalString(args.user.user_metadata?.full_name);
  const nextThread = await upsertThread({
    userId: args.user.id,
    metaChannelId: null,
    contactWaId: args.thread.contactWaId,
    contactName: args.thread.contactName,
    displayPhone: args.thread.displayPhone || recipientId,
    source: 'Messenger',
    remark: args.body,
    avatarUrl: args.thread.avatarUrl,
    status: 'Connected',
    lastMessageText: args.body,
    lastMessageAt: createdAt,
    unreadDelta: 0,
  });

  const message = await insertMessage({
    userId: args.user.id,
    threadId: nextThread.id,
    waMessageId: remote.message_id || null,
    direction: 'outbound',
    messageType: 'text',
    body: args.body,
    senderName: senderLabel,
    senderWaId: getMessengerThreadIdentity(pageId),
    recipientWaId: getMessengerThreadIdentity(recipientId),
    status: 'sent',
    raw: {
      client_temp_id: args.clientTempId || null,
      source: 'messenger',
      recipient: {
        id: recipientId,
      },
      type: 'text',
      text: {
        body: args.body,
      },
      remote,
    },
  });

  return {
    remote,
    thread: nextThread,
    message,
  };
}

async function sendThreadOutgoingInstagramTextMessage(args: {
  user: User;
  channelRow: Record<string, unknown>;
  userAccessToken: string;
  pageAccessToken?: string;
  thread: ConversationThread;
  body: string;
  clientTempId?: string;
}) {
  const instagramAccountId = normalizeOptionalIdentifier(args.channelRow.instagram_account_id);
  const recipientId = getThreadRecipientIdFromIdentity(args.thread, 'instagram');

  if (!instagramAccountId) {
    throw new Error('Instagram account ID is missing from the connected channel.');
  }

  if (!recipientId) {
    throw new Error('This Instagram conversation is missing a recipient ID.');
  }

  const remote = await sendRemoteInstagramTextMessage({
    userAccessToken: args.userAccessToken,
    pageAccessToken: args.pageAccessToken,
    instagramAccountId,
    recipientId,
    body: args.body,
  });
  const createdAt = new Date().toISOString();
  const senderLabel =
    normalizeOptionalString(args.channelRow.instagram_username) ||
    normalizeOptionalString(args.channelRow.instagram_name) ||
    normalizeOptionalString(args.user.user_metadata?.full_name);
  const nextThread = await upsertThread({
    userId: args.user.id,
    metaChannelId: null,
    contactWaId: args.thread.contactWaId,
    contactName: args.thread.contactName,
    displayPhone: args.thread.displayPhone || recipientId,
    source: 'Instagram',
    remark: args.body,
    avatarUrl: args.thread.avatarUrl,
    status: 'Connected',
    lastMessageText: args.body,
    lastMessageAt: createdAt,
    unreadDelta: 0,
  });

  const message = await insertMessage({
    userId: args.user.id,
    threadId: nextThread.id,
    waMessageId: remote.message_id || null,
    direction: 'outbound',
    messageType: 'text',
    body: args.body,
    senderName: senderLabel,
    senderWaId: getInstagramThreadIdentity(instagramAccountId),
    recipientWaId: getInstagramThreadIdentity(recipientId),
    status: 'sent',
    raw: {
      client_temp_id: args.clientTempId || null,
      source: 'instagram',
      recipient: {
        id: recipientId,
      },
      type: 'text',
      text: {
        body: args.body,
      },
      remote,
    },
  });

  return {
    remote,
    thread: nextThread,
    message,
  };
}

function buildOutgoingTextPayload(input: SendTextMessageInput): WhatsAppMessagePayload {
  return {
    to: input.to,
    type: 'text',
    context: input.replyToMessageId
      ? {
          message_id: input.replyToMessageId,
        }
      : undefined,
    text: {
      body: input.body,
      preview_url: input.previewUrl === true,
    },
  };
}

function buildCallPermissionRequestPayload(input: { to: string; body?: string | null }): WhatsAppMessagePayload {
  const body = normalizeOptionalString(input.body) || 'We would like to call you on WhatsApp to help with your request.';

  return {
    to: input.to,
    type: 'interactive',
    interactive: {
      type: 'call_permission_request',
      action: {
        name: 'call_permission_request',
      },
      body: {
        text: body,
      },
    },
  };
}

function buildOutgoingMediaPayload(input: SendMediaMessageInput): WhatsAppMessagePayload {
  const baseMediaObject = {
    ...(input.mediaId ? { id: input.mediaId } : {}),
    ...(input.mediaLink ? { link: input.mediaLink } : {}),
    ...(input.caption ? { caption: input.caption } : {}),
    ...(input.fileName && input.mediaType === 'document' ? { filename: input.fileName } : {}),
  };
  const context = input.replyToMessageId
    ? {
        message_id: input.replyToMessageId,
      }
    : undefined;

  switch (input.mediaType) {
    case 'image':
      return {
        to: input.to,
        type: 'image',
        context,
        image: baseMediaObject,
      };
    case 'video':
      return {
        to: input.to,
        type: 'video',
        context,
        video: baseMediaObject,
      };
    case 'audio':
      return {
        to: input.to,
        type: 'audio',
        context,
        audio: baseMediaObject,
      };
    case 'document':
      return {
        to: input.to,
        type: 'document',
        context,
        document: baseMediaObject,
      };
  }
}

function buildOutgoingTemplatePayload(input: SendTemplateMessageInput): WhatsAppMessagePayload {
  return {
    to: input.to,
    type: 'template',
    context: input.replyToMessageId
      ? {
          message_id: input.replyToMessageId,
        }
      : undefined,
    template: {
      name: input.templateName,
      language: {
        code: input.language,
      },
      ...(Array.isArray(input.components) && input.components.length > 0
        ? {
            components: input.components,
          }
        : {}),
    },
  };
}

function getRemoteWhatsAppInitialMessageStatus(remote: RemoteWhatsAppMessageResponse) {
  return normalizeOptionalString(remote.messages?.[0]?.message_status) || 'accepted';
}

async function buildOutgoingFlowPayload(input: {
  userId: string;
  to: string;
  action: AutomationRuleAction;
  replyToMessageId?: string | null;
}): Promise<WhatsAppMessagePayload> {
  const flowId = normalizeOptionalIdentifier(input.action.flowId);

  if (!flowId) {
    throw new Error('Flow action is missing a Flow.');
  }

  const flow = mapFlow(await getStoredFlowRow(input.userId, flowId));
  const metaFlowId = normalizeOptionalIdentifier(flow.metaFlowId);

  if (!metaFlowId) {
    throw new Error(`Flow "${flow.name}" is not synced with Meta yet.`);
  }

  const flowCta = normalizeOptionalString(input.action.flowCta) || 'Open Flow';
  const flowBody = normalizeOptionalString(input.action.flowBody) || `Please complete ${flow.name}.`;
  const flowHeader = normalizeOptionalString(input.action.flowHeader);
  const flowFooter = normalizeOptionalString(input.action.flowFooter);
  const flowMode =
    input.action.flowMode === 'draft' || flow.status === 'DRAFT'
      ? 'draft'
      : 'published';
  const flowAction = input.action.flowAction === 'data_exchange' ? 'data_exchange' : 'navigate';
  const flowScreen = normalizeOptionalString(input.action.flowScreen) || getFlowEntryScreenFromRaw(flow.raw);
  const parameters: Record<string, unknown> = {
    flow_message_version: whatsAppFlowMessageVersion,
    flow_token: normalizeOptionalString(input.action.flowToken) || `flow:${flow.id}`,
    flow_id: metaFlowId,
    flow_cta: flowCta,
    mode: flowMode,
    flow_action: flowAction,
  };

  if (flowAction === 'navigate') {
    const flowActionPayload: Record<string, unknown> = {};

    if (flowScreen) {
      flowActionPayload.screen = flowScreen;
    }

    if (isRecord(input.action.flowActionData) && Object.keys(input.action.flowActionData).length > 0) {
      flowActionPayload.data = JSON.stringify(input.action.flowActionData);
    }

    if (Object.keys(flowActionPayload).length > 0) {
      parameters.flow_action_payload = flowActionPayload;
    }
  }

  return {
    to: input.to,
    type: 'interactive',
    context: input.replyToMessageId
      ? {
          message_id: input.replyToMessageId,
        }
      : undefined,
    interactive: {
      type: 'flow',
      ...(flowHeader
        ? {
            header: {
              type: 'text',
              text: flowHeader,
            },
          }
        : {}),
      body: {
        text: flowBody,
      },
      ...(flowFooter
        ? {
            footer: {
              text: flowFooter,
            },
          }
        : {}),
      action: {
        name: 'flow',
        parameters,
      },
    },
  };
}

async function getThreadMessages(userId: string, threadId: string, options?: { markRead?: boolean }) {
  const markRead = options?.markRead ?? true;
  const [threadResult, messagesResult] = await Promise.all([
    adminSupabase.from('conversation_threads').select('*').eq('user_id', userId).eq('id', threadId).maybeSingle(),
    adminSupabase
      .from('conversation_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
  ]);

  if (threadResult.error) throw threadResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (!threadResult.data) throw new Error('Conversation not found.');

  let threadRow = threadResult.data as Record<string, unknown>;
  let messageRows = ((messagesResult.data || []) as Record<string, unknown>[]) || [];

  if (markRead && Number(threadResult.data.unread_count || 0) > 0) {
    const updatedAt = new Date().toISOString();
    const { error: threadUpdateError } = await adminSupabase
      .from('conversation_threads')
      .update({
        unread_count: 0,
        updated_at: updatedAt,
      })
      .eq('user_id', userId)
      .eq('id', threadId);

    if (threadUpdateError) {
      throw threadUpdateError;
    }

    threadRow = {
      ...threadRow,
      unread_count: 0,
      updated_at: updatedAt,
    };

    const latestUnreadInboundMessage = [...messageRows].reverse().find((row) => {
      return (
        row.direction === 'inbound' &&
        isWhatsAppCloudMessageId(row.wa_message_id) &&
        normalizeOptionalString(row.status) !== 'read'
      );
    });

    if (latestUnreadInboundMessage) {
      try {
        const { row: channelRow, accessToken } = await getChannelWithToken(userId);
        const phoneNumberId = normalizeOptionalIdentifier(channelRow.phone_number_id);
        const messageId = normalizeOptionalString(latestUnreadInboundMessage.wa_message_id);

        if (phoneNumberId && messageId) {
          await markRemoteWhatsAppMessageRead(accessToken, phoneNumberId, messageId);

          const latestCreatedAtMs = Date.parse(String(latestUnreadInboundMessage.created_at || ''));
          const readMessageIds = messageRows
            .filter((row) => {
              if (
                row.direction !== 'inbound' ||
                !isWhatsAppCloudMessageId(row.wa_message_id) ||
                normalizeOptionalString(row.status) === 'read'
              ) {
                return false;
              }

              if (!Number.isFinite(latestCreatedAtMs)) {
                return String(row.id) === String(latestUnreadInboundMessage.id);
              }

              const createdAtMs = Date.parse(String(row.created_at || ''));
              return Number.isFinite(createdAtMs) && createdAtMs <= latestCreatedAtMs;
            })
            .map((row) => String(row.id));

          if (readMessageIds.length > 0) {
            const { error: messagesUpdateError } = await adminSupabase
              .from('conversation_messages')
              .update({
                status: 'read',
              })
              .eq('user_id', userId)
              .in('id', readMessageIds);

            if (messagesUpdateError) {
              throw messagesUpdateError;
            }

            const readMessageIdsSet = new Set(readMessageIds);
            messageRows = messageRows.map((row) =>
              readMessageIdsSet.has(String(row.id))
                ? {
                    ...row,
                    status: 'read',
                  }
                : row,
            );
          }
        }
      } catch (error) {
        console.error('Failed to sync WhatsApp read receipt:', error);
      }
    }
  }

  return {
    thread: mapThread(threadRow),
    messages: messageRows.map((row) => mapMessage(row)),
  };
}

async function getThreadById(userId: string, threadId: string) {
  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Conversation not found.');
  }

  return mapThread(data as Record<string, unknown>);
}

async function ensureConversationReplyWindowOpen(userId: string, thread: ConversationThread) {
  const { data, error } = await adminSupabase
    .from('conversation_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('thread_id', thread.id)
    .eq('direction', 'inbound')
    .neq('message_type', 'call_summary')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const latestInboundAt = normalizeOptionalString(data?.[0]?.created_at);
  const latestInboundAtMs = latestInboundAt ? Date.parse(latestInboundAt) : Number.NaN;
  const channel = getConversationThreadMessagingChannel(thread);
  const channelLabel =
    channel === 'instagram' ? 'Instagram' : channel === 'messenger' ? 'Messenger' : 'WhatsApp';

  if (!Number.isFinite(latestInboundAtMs) || Date.now() >= latestInboundAtMs + CUSTOMER_SERVICE_WINDOW_MS) {
    if (channel === 'whatsapp') {
      throw new Error('This chat has expired. Send an approved template to continue the WhatsApp conversation.');
    }

    throw new Error(
      `This ${channelLabel} chat has expired. You can reply after the customer sends a new message.`,
    );
  }
}

async function deleteContact(userId: string, threadId: string) {
  const { data, error } = await adminSupabase
    .from('conversation_threads')
    .delete()
    .eq('user_id', userId)
    .eq('id', threadId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Contact not found.');
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    graphVersion,
  });
});

app.get('/api/meta/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === metaWebhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send('Invalid verify token.');
});

app.post('/api/meta/webhook', async (req, res) => {
  try {
    const payload = req.body as {
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: Record<string, unknown>;
        }>;
      }>;
    };

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        const metadata = value && isRecord(value.metadata) ? (value.metadata as Record<string, unknown>) : null;
        const phoneNumberId = normalizeOptionalString(metadata?.phone_number_id);

        if (!phoneNumberId) {
          continue;
        }

        const { data: channel, error: channelError } = await adminSupabase
          .from('meta_channels')
          .select('*')
          .eq('phone_number_id', phoneNumberId)
          .maybeSingle();

        if (channelError || !channel) {
          continue;
        }

        const userId = String(channel.user_id);
        const metaChannelId = String(channel.id);
        const accessToken = decryptAccessToken(String(channel.access_token_ciphertext || ''));
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const firstContact =
          contacts[0] && isRecord(contacts[0]) ? (contacts[0] as Record<string, unknown>) : null;
        const contactProfile =
          firstContact && isRecord(firstContact.profile) ? (firstContact.profile as Record<string, unknown>) : null;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        const calls = Array.isArray(value?.calls) ? value.calls : [];

        for (const message of messages) {
          if (!isRecord(message)) {
            continue;
          }

          const createdAt = toIsoTimestamp(message.timestamp as string | number | null | undefined) || new Date().toISOString();
          const messageRecord = message as Record<string, unknown>;
          const messageId = normalizeOptionalString(message.id) || null;
          const body = getMessageText(messageRecord);

          if (messageId) {
            const existingMessage = await adminSupabase
              .from('conversation_messages')
              .select('id')
              .eq('user_id', userId)
              .eq('wa_message_id', messageId)
              .maybeSingle();

            if (existingMessage.error) {
              throw existingMessage.error;
            }

            if (existingMessage.data) {
              continue;
            }
          }

          let thread = await upsertThread({
            userId,
            metaChannelId,
            contactWaId: String(message.from || firstContact?.wa_id || ''),
            contactName: (contactProfile?.name as string | undefined) || null,
            displayPhone: String(message.from || firstContact?.wa_id || ''),
            status: 'New Lead',
            lastMessageText: body,
            lastMessageAt: createdAt,
            unreadDelta: 1,
          });
          const isNewConversation = Math.abs(Date.parse(thread.createdAt) - Date.parse(createdAt)) < 2000;

          await insertMessage({
            userId,
            threadId: thread.id,
            waMessageId: messageId,
            direction: 'inbound',
            messageType: normalizeOptionalString(message.type) || 'text',
            body,
            senderName: (contactProfile?.name as string | undefined) || null,
            senderWaId: normalizeOptionalString(message.from) || null,
            recipientWaId: phoneNumberId,
            status: 'received',
            raw: messageRecord,
          });

          const flowReply = getFlowReplyFromMessage(messageRecord);

          if (flowReply) {
            try {
              await recordFlowSubmission({
                userId,
                threadId: thread.id,
                contactId: normalizeOptionalString(message.from) || normalizeOptionalString(firstContact?.wa_id),
                messageId,
                responses: flowReply.responses,
                submittedAt: createdAt,
              });

              const refreshedThread = await adminSupabase
                .from('conversation_threads')
                .select('*')
                .eq('user_id', userId)
                .eq('id', thread.id)
                .maybeSingle();

              if (!refreshedThread.error && refreshedThread.data) {
                thread = mapThread(refreshedThread.data as Record<string, unknown>);
              }
            } catch (error) {
              console.error('Flow response processing failed:', error);
            }
          }

          await createIncomingMessageNotification({
            userId,
            source: 'WhatsApp',
            messageId,
            contactName: normalizeOptionalString(contactProfile?.name),
            contactValue: normalizeOptionalString(message.from) || normalizeOptionalString(firstContact?.wa_id),
            previewText: body,
            threadId: thread.id,
          });

          try {
            await processAutomationRulesForIncomingMessage({
              userId,
              metaChannelId,
              phoneNumberId,
              accessToken,
              thread,
              body,
              receivedAt: createdAt,
              isNewConversation,
              contactExists: !isNewConversation,
              senderWaId: normalizeOptionalString(message.from) || normalizeOptionalString(firstContact?.wa_id),
              messageId,
            });
          } catch (error) {
            console.error('Automation rule processing failed:', error);
          }
        }

        for (const call of calls) {
          if (!isRecord(call)) {
            continue;
          }

          await handleCallWebhookEntry({
            userId,
            metaChannelId,
            callRecord: call,
            fallbackContactName: (contactProfile?.name as string | undefined) || null,
          });
        }

        for (const status of statuses) {
          if (!isRecord(status)) {
            continue;
          }

          const handledCallStatus = await handleCallWebhookStatus({
            userId,
            metaChannelId,
            statusRecord: status,
          });

          if (handledCallStatus) {
            continue;
          }

          await updateOutgoingWhatsAppMessageStatus({
            userId,
            statusRecord: status,
          });
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, 500, error);
  }
});

function handleMessengerWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const validTokens = new Set(
    [messengerWebhookVerifyToken, instagramWebhookVerifyToken].filter(Boolean),
  );

  if (mode === 'subscribe' && validTokens.has(String(token || ''))) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send('Invalid verify token.');
}

function handleInstagramWebhookVerification(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const validTokens = new Set(
    [instagramWebhookVerifyToken, messengerWebhookVerifyToken].filter(Boolean),
  );

  if (mode === 'subscribe' && validTokens.has(String(token || ''))) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).send('Invalid verify token.');
}

async function handleMessengerWebhookEvent(req: Request, res: Response) {
  try {
    const payload = req.body as {
      object?: string;
      entry?: Array<Record<string, unknown>>;
    };
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    console.info('Messenger/Page webhook received:', {
      object: payload.object || null,
      entries: entries.length,
      path: req.path,
    });

    if (payload.object === 'page') {
      await processMessengerWebhookPayload(payload);
      await processInstagramWebhookPayload(payload);
    } else if (payload.object === 'instagram') {
      await processInstagramWebhookPayload(payload);
    }
  } catch (error) {
    console.error('Messenger webhook handling error:', error);
  }

  res.status(200).json({ ok: true });
}

async function processMessengerWebhookPayload(payload: {
  entry?: Array<Record<string, unknown>>;
}) {
  const pageIds = Array.from(
    new Set(
      (payload.entry || [])
        .map((entry) => normalizeOptionalIdentifier(entry.id))
        .filter((pageId): pageId is string => Boolean(pageId)),
    ),
  );

  if (pageIds.length === 0) {
    return;
  }

  const channelsResult = await adminSupabase
    .from('messenger_channels')
    .select('*')
    .in('page_id', pageIds);

  if (channelsResult.error && !isMissingSchemaError(channelsResult.error)) {
    throw channelsResult.error;
  }

  const channelRows = ((channelsResult.data || []) as Record<string, unknown>[]) || [];
  const channelByPageId = new Map(
    channelRows.map((row) => [normalizeOptionalIdentifier(row.page_id) || '', row]),
  );
  const matchedPageIds = channelRows
    .map((row) => normalizeOptionalIdentifier(row.page_id))
    .filter((pageId): pageId is string => Boolean(pageId));

  if (matchedPageIds.length > 0) {
    await adminSupabase
      .from('messenger_channels')
      .update({
        last_synced_at: new Date().toISOString(),
        webhook_subscribed: true,
        webhook_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('page_id', matchedPageIds);
  }

  const profileCache = new Map<
    string,
    Promise<{
      id: string;
      name: string | null;
      profilePictureUrl: string | null;
    } | null>
  >();

  const getProfile = (
    channelRow: Record<string, unknown>,
    senderId: string,
  ) => {
    const pageId = normalizeOptionalIdentifier(channelRow.page_id) || '';
    const cacheKey = `${pageId}:${senderId}`;

    if (!profileCache.has(cacheKey)) {
      const pageAccessTokenCiphertext = normalizeOptionalString(channelRow.page_access_token_ciphertext);
      let promise: Promise<{
        id: string;
        name: string | null;
        profilePictureUrl: string | null;
      } | null>;

      try {
        promise = pageAccessTokenCiphertext
          ? fetchMessengerUserProfile(decryptAccessToken(pageAccessTokenCiphertext), senderId).catch((error) => {
            console.error('Failed to fetch Messenger user profile:', error);
            return null;
          })
          : Promise.resolve(null);
      } catch (error) {
        console.error('Failed to decrypt Messenger page access token:', error);
        promise = Promise.resolve(null);
      }

      profileCache.set(cacheKey, promise);
    }

    return profileCache.get(cacheKey)!;
  };

  for (const entry of payload.entry || []) {
    if (!isRecord(entry)) {
      continue;
    }

    const pageId = normalizeOptionalIdentifier(entry.id);

    if (!pageId) {
      continue;
    }

    const channelRow = channelByPageId.get(pageId);
    const userId = normalizeOptionalIdentifier(channelRow?.user_id);
    if (!channelRow || !userId) {
      continue;
    }

    const events = Array.isArray(entry.messaging)
      ? entry.messaging.filter((event): event is Record<string, unknown> => isRecord(event))
      : [];

    for (const event of events) {
      if (!isMessengerPageMessagingEvent(event, pageId)) {
        continue;
      }

      const inboundEvent = parseMessengerInboundEvent(event);

      if (!inboundEvent) {
        continue;
      }

      const existingMessageResult = await adminSupabase
        .from('conversation_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('wa_message_id', inboundEvent.messageId)
        .maybeSingle();

      if (existingMessageResult.error) {
        throw existingMessageResult.error;
      }

      if (existingMessageResult.data) {
        continue;
      }

      const profile = await getProfile(channelRow, inboundEvent.senderId);
      const fetchedContactName = profile?.name || null;
      const profilePictureUrl = profile?.profilePictureUrl || null;

      const thread = await upsertThread({
        userId,
        metaChannelId: null,
        contactWaId: getMessengerThreadIdentity(inboundEvent.senderId),
        contactName: fetchedContactName,
        username: fetchedContactName,
        displayPhone: inboundEvent.senderId,
        source: 'Messenger',
        remark: inboundEvent.body,
        avatarUrl: profilePictureUrl,
        status: 'New Lead',
        priority: 'Medium',
        ownerName: null,
        lastMessageText: inboundEvent.body,
        lastMessageAt: inboundEvent.createdAt,
        unreadDelta: 1,
      });
      const contactName = thread.contactName || fetchedContactName;

      await insertMessage({
        userId,
        threadId: thread.id,
        waMessageId: inboundEvent.messageId,
        direction: 'inbound',
        messageType: inboundEvent.messageType,
        body: inboundEvent.body,
        senderName: contactName,
        senderWaId: getMessengerThreadIdentity(inboundEvent.senderId),
        recipientWaId: getMessengerThreadIdentity(inboundEvent.recipientId),
        status: 'received',
        raw: {
          ...inboundEvent.raw,
          sender_profile: profile,
        },
      });

      await createIncomingMessageNotification({
        userId,
        source: 'Messenger',
        messageId: inboundEvent.messageId,
        contactName,
        contactValue: inboundEvent.senderId,
        previewText: inboundEvent.body,
        threadId: thread.id,
      });
    }
  }
}

async function processInstagramWebhookPayload(payload: {
  entry?: Array<Record<string, unknown>>;
}) {
  const identifierSet = new Set<string>();

  for (const entry of payload.entry || []) {
    const entryId = normalizeOptionalIdentifier(entry.id);
    if (entryId) {
      identifierSet.add(entryId);
    }

    const events = Array.isArray(entry.messaging)
      ? entry.messaging.filter((event): event is Record<string, unknown> => isRecord(event))
      : [];

    for (const event of events) {
      const recipient = isRecord(event.recipient) ? event.recipient : null;
      const recipientId = normalizeOptionalIdentifier(recipient?.id);

      if (recipientId) {
        identifierSet.add(recipientId);
      }
    }
  }

  const identifiers = Array.from(identifierSet);
  if (identifiers.length === 0) {
    return;
  }

  const [byInstagramAccountResult, byPageResult] = await Promise.all([
    adminSupabase
      .from('instagram_channels')
      .select('*')
      .in('instagram_account_id', identifiers),
    adminSupabase
      .from('instagram_channels')
      .select('*')
      .in('page_id', identifiers),
  ]);

  if (byInstagramAccountResult.error && !isMissingSchemaError(byInstagramAccountResult.error)) {
    throw byInstagramAccountResult.error;
  }

  if (byPageResult.error && !isMissingSchemaError(byPageResult.error)) {
    throw byPageResult.error;
  }

  const channelRowsById = new Map<string, Record<string, unknown>>();

  for (const row of [
    ...(((byInstagramAccountResult.data || []) as Record<string, unknown>[]) || []),
    ...(((byPageResult.data || []) as Record<string, unknown>[]) || []),
  ]) {
    const rowId = normalizeOptionalIdentifier(row.id);
    if (rowId) {
      channelRowsById.set(rowId, row);
    }
  }

  const channelRows = Array.from(channelRowsById.values());
  const channelByInstagramAccountId = new Map(
    channelRows.map((row) => [normalizeOptionalIdentifier(row.instagram_account_id) || '', row]),
  );
  const channelByPageId = new Map(
    channelRows.map((row) => [normalizeOptionalIdentifier(row.page_id) || '', row]),
  );
  const channelIds = channelRows
    .map((row) => normalizeOptionalIdentifier(row.id))
    .filter((id): id is string => Boolean(id));

  if (channelIds.length > 0) {
    await adminSupabase
      .from('instagram_channels')
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', channelIds);
  }

  const profileCache = new Map<
    string,
    Promise<{
      id: string;
      name: string | null;
      username: string | null;
      profilePictureUrl: string | null;
    } | null>
  >();

  const getProfile = (
    channelRow: Record<string, unknown>,
    senderId: string,
  ) => {
    const instagramAccountId = normalizeOptionalIdentifier(channelRow.instagram_account_id) || '';
    const cacheKey = `${instagramAccountId}:${senderId}`;

    if (!profileCache.has(cacheKey)) {
      const promise: Promise<{
        id: string;
        name: string | null;
        username: string | null;
        profilePictureUrl: string | null;
      } | null> = fetchInstagramMessagingUserProfileForChannel(channelRow, senderId).catch((error) => {
        console.error('Failed to fetch Instagram user profile:', error);
        return null;
      });

      profileCache.set(cacheKey, promise);
    }

    return profileCache.get(cacheKey)!;
  };

  for (const entry of payload.entry || []) {
    if (!isRecord(entry)) {
      continue;
    }

    const entryId = normalizeOptionalIdentifier(entry.id);
    const events = Array.isArray(entry.messaging)
      ? entry.messaging.filter((event): event is Record<string, unknown> => isRecord(event))
      : [];

    for (const event of events) {
      const recipient = isRecord(event.recipient) ? event.recipient : null;
      const recipientId = normalizeOptionalIdentifier(recipient?.id);
      const channelByEntryInstagramId = entryId ? channelByInstagramAccountId.get(entryId) : null;
      const channelByEntryPageId = entryId ? channelByPageId.get(entryId) : null;
      const channelByRecipientInstagramId = recipientId
        ? channelByInstagramAccountId.get(recipientId)
        : null;
      const channelByRecipientPageId = recipientId ? channelByPageId.get(recipientId) : null;
      const channelRow =
        channelByEntryInstagramId ||
        channelByRecipientInstagramId ||
        channelByEntryPageId ||
        channelByRecipientPageId ||
        null;
      const userId = normalizeOptionalIdentifier(channelRow?.user_id);
      const instagramAccountId = normalizeOptionalIdentifier(channelRow?.instagram_account_id);

      if (!channelRow || !userId || !instagramAccountId) {
        continue;
      }

      const pageId = normalizeOptionalIdentifier(channelRow.page_id);
      const matchedByInstagramId = Boolean(channelByEntryInstagramId || channelByRecipientInstagramId);
      if (!matchedByInstagramId && pageId && recipientId === pageId) {
        continue;
      }

      const inboundEvent = parseInstagramInboundEvent(event, instagramAccountId);

      if (!inboundEvent) {
        continue;
      }

      const existingMessageResult = await adminSupabase
        .from('conversation_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('wa_message_id', inboundEvent.messageId)
        .maybeSingle();

      if (existingMessageResult.error) {
        throw existingMessageResult.error;
      }

      if (existingMessageResult.data) {
        continue;
      }

      const profile = await getProfile(channelRow, inboundEvent.senderId);
      const displayHandle = profile?.username ? `@${profile.username}` : null;
      const contactName = profile?.name || displayHandle || null;
      const contactValue = displayHandle || inboundEvent.senderId;

      const thread = await upsertThread({
        userId,
        metaChannelId: null,
        contactWaId: getInstagramThreadIdentity(inboundEvent.senderId),
        contactName,
        username: displayHandle || profile?.name || null,
        displayPhone: contactValue,
        source: 'Instagram',
        remark: inboundEvent.body,
        avatarUrl: profile?.profilePictureUrl || null,
        status: 'New Lead',
        priority: 'Medium',
        ownerName: null,
        lastMessageText: inboundEvent.body,
        lastMessageAt: inboundEvent.createdAt,
        unreadDelta: 1,
      });

      await insertMessage({
        userId,
        threadId: thread.id,
        waMessageId: inboundEvent.messageId,
        direction: 'inbound',
        messageType: inboundEvent.messageType,
        body: inboundEvent.body,
        senderName: contactName,
        senderWaId: getInstagramThreadIdentity(inboundEvent.senderId),
        recipientWaId: getInstagramThreadIdentity(inboundEvent.recipientId),
        status: 'received',
        raw: {
          ...inboundEvent.raw,
          sender_profile: profile,
        },
      });

      await createIncomingMessageNotification({
        userId,
        source: 'Instagram',
        messageId: inboundEvent.messageId,
        contactName,
        contactValue,
        previewText: inboundEvent.body,
        threadId: thread.id,
      });
    }
  }
}

async function handleInstagramWebhookEvent(req: Request, res: Response) {
  try {
    const payload = req.body as {
      object?: string;
      entry?: Array<Record<string, unknown>>;
    };
    const entries = Array.isArray(payload.entry) ? payload.entry : [];

    console.info('Instagram webhook received:', {
      object: payload.object || null,
      entries: entries.length,
      path: req.path,
    });

    if (payload.object === 'instagram') {
      await processInstagramWebhookPayload(payload);
    } else if (payload.object === 'page') {
      await processInstagramWebhookPayload(payload);
    }
  } catch (error) {
    console.error('Instagram webhook handling error:', error);
  }

  res.status(200).json({ ok: true });
}

app.get('/api/messenger/webhook', handleMessengerWebhookVerification);
app.get('/api/meta/messenger/webhook', handleMessengerWebhookVerification);
app.get('/api/instagram/webhook', handleInstagramWebhookVerification);
app.get('/api/meta/instagram/webhook', handleInstagramWebhookVerification);

app.post('/api/messenger/webhook', handleMessengerWebhookEvent);
app.post('/api/meta/messenger/webhook', handleMessengerWebhookEvent);
app.post('/api/instagram/webhook', handleInstagramWebhookEvent);
app.post('/api/meta/instagram/webhook', handleInstagramWebhookEvent);

app.get('/api/meta/catalog/webhook', async (req, res) => {
  try {
    requireMetaWebhookVerifyToken();
    const mode = normalizeOptionalString(req.query['hub.mode']);
    const verifyToken = normalizeOptionalString(req.query['hub.verify_token']);
    const challenge = normalizeOptionalString(req.query['hub.challenge']);

    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      res.status(400).send('Missing Meta webhook verification parameters.');
      return;
    }

    if (verifyToken !== metaWebhookVerifyToken) {
      res.status(403).send('Invalid verify token.');
      return;
    }

    res.status(200).send(challenge);
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/meta/catalog/webhook', async (req, res) => {
  try {
    const payload = isRecord(req.body) ? (req.body as Record<string, unknown>) : {};
    const matchedAt = new Date().toISOString();
    const { identifiers, rows } = await findMetaChannelRowsForCatalogWebhookPayload(payload);

    if (!rows.length) {
      console.warn('Catalog webhook received without a matching Meta channel:', {
        object: normalizeOptionalString(payload.object),
        identifiers,
      });
      res.status(200).json({ ok: true });
      return;
    }

    await Promise.all(
      rows.map(async (row) => {
        const existingMetadata = getMetaChannelMetadata(row);
        const existingCatalogWebhook = getCatalogWebhookMetadata(existingMetadata);
        const { error } = await adminSupabase
          .from('meta_channels')
          .update({
            metadata: {
              ...existingMetadata,
              catalogWebhook: {
                ...existingCatalogWebhook,
                callbackUrl: getMetaCatalogWebhookCallbackUrl(req),
                verifyTokenLast4: metaWebhookVerifyToken ? last4(metaWebhookVerifyToken) : null,
                lastWebhookAt: matchedAt,
                lastMatchedAt: matchedAt,
                lastWebhookObject: normalizeOptionalString(payload.object),
                lastCatalogIds: identifiers.catalogIds,
                lastIdentifiers: identifiers,
                lastError: null,
                updatedAt: matchedAt,
              },
            },
            updated_at: matchedAt,
          })
          .eq('id', row.id)
          .eq('user_id', row.user_id);

        if (error) {
          throw error;
        }
      }),
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/meta/lead-capture/webhook', async (req, res) => {
  try {
    const mode = normalizeOptionalString(req.query['hub.mode']);
    const verifyToken = normalizeOptionalString(req.query['hub.verify_token']);
    const challenge = normalizeOptionalString(req.query['hub.challenge']);

    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      res.status(400).send('Missing Meta webhook verification parameters.');
      return;
    }

    const configResult = await adminSupabase
      .from('meta_lead_capture_configs')
      .select('user_id')
      .eq('verify_token', verifyToken)
      .maybeSingle();

    if (configResult.error) {
      throw configResult.error;
    }

    if (!configResult.data) {
      res.status(403).send('Invalid verify token.');
      return;
    }

    await adminSupabase
      .from('meta_lead_capture_configs')
      .update({
        verified_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('verify_token', verifyToken);

    res.status(200).send(challenge);
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post('/api/meta/lead-capture/webhook', async (req, res) => {
  try {
    const payload = req.body as {
      entry?: Array<Record<string, unknown>>;
    };

    for (const entry of payload.entry || []) {
      if (!isRecord(entry)) {
        continue;
      }

      const pageId = normalizeOptionalIdentifier(entry.id);
      if (pageId) {
        const updateResult = await adminSupabase
          .from('meta_lead_capture_configs')
          .update({
            last_webhook_at: new Date().toISOString(),
            last_error: null,
          })
          .contains('page_ids', [pageId]);

        if (updateResult.error) {
          throw updateResult.error;
        }
      }

      const changes = Array.isArray(entry.changes)
        ? entry.changes.filter((change): change is Record<string, unknown> => isRecord(change))
        : [];

      for (const change of changes) {
        await processMetaLeadCaptureChange(change, pageId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.post(['/api/razorpay/webhook', '/api/integrations/razorpay/webhook'], async (req, res) => {
  try {
    verifyRazorpayWebhookSignature(req);

    if (!isRecord(req.body)) {
      throw new Error('Razorpay webhook payload must be a JSON object.');
    }

    const result = await insertRazorpayWebhookEvent(req, req.body as Record<string, unknown>);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/woocommerce/webhook/:userId', async (req, res) => {
  try {
    const userId = normalizeOptionalIdentifier(req.params.userId);

    if (!userId) {
      throw new Error('WooCommerce webhook user ID is required.');
    }

    const { data, error } = await adminSupabase
      .from('woocommerce_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('WooCommerce connection was not found.');
    }

    const signature = normalizeOptionalString(req.header('x-wc-webhook-signature'));
    const webhookSecretCiphertext = normalizeOptionalString(data.webhook_secret_ciphertext);

    if (!signature || !webhookSecretCiphertext || !req.rawBody) {
      throw new Error('WooCommerce webhook signature is missing.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', decryptSecretValue(webhookSecretCiphertext))
      .update(req.rawBody)
      .digest('base64');
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new Error('WooCommerce webhook signature is invalid.');
    }

    await adminSupabase
      .from('woocommerce_connections')
      .update({
        status: 'connected',
        last_verified_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('user_id', userId);

    res.status(200).json({ ok: true });
  } catch (error) {
    const userId = normalizeOptionalIdentifier(req.params.userId);
    if (userId) {
      const updateResult = await adminSupabase
        .from('woocommerce_connections')
        .update({
          status: 'error',
          last_error: mapDbError(error),
        })
        .eq('user_id', userId);

      if (updateResult.error) {
        console.error('Failed to update WooCommerce webhook error state:', updateResult.error);
      }
    }

    sendError(res, 400, error);
  }
});

app.post('/api/auth/password-reset', async (req, res) => {
  try {
    const email = normalizeEmailAddress(req.body?.email);
    const redirectToInput = normalizeOptionalString(req.body?.redirectTo);
    const captchaToken = normalizeOptionalString(req.body?.captchaToken) || undefined;
    const redirectTo = redirectToInput || `${frontendOrigin.replace(/\/$/, '')}/login?password_setup=recovery`;

    if (!email) {
      throw new Error('Enter a valid email address.');
    }

    await verifyPasswordResetUserExists(email);
    sendPasswordResetEmailInBackground({ email, redirectTo, captchaToken });

    res.json({ ok: true });
  } catch (error) {
    sendError(res, 404, error);
  }
});

app.use('/api', authenticate);

app.get('/api/bootstrap', async (req, res) => {
  try {
    res.json(await getBootstrap(req.authedUser!));
  } catch (error) {
    sendError(res, 500, error);
  }
});

app.get('/api/developer/api-credentials', async (req, res) => {
  try {
    res.json({
      credentials: await listDeveloperApiCredentials(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/developer/api-credentials', async (req, res) => {
  try {
    res.json(
      await createDeveloperApiCredential(
        req.authedUser!.id,
        (req.body || {}) as DeveloperApiCredentialCreateInput,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/developer/api-credentials/:credentialId/secret', async (req, res) => {
  try {
    res.json(
      await regenerateDeveloperApiCredentialSecret(
        req.authedUser!.id,
        req.params.credentialId,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/developer/api-credentials/:credentialId', async (req, res) => {
  try {
    res.json(await deleteDeveloperApiCredential(req.authedUser!.id, req.params.credentialId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/developer/webhooks', async (req, res) => {
  try {
    res.json({
      webhooks: await listDeveloperWebhooks(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/developer/webhooks', async (req, res) => {
  try {
    res.json(await createDeveloperWebhook(req.authedUser!.id, (req.body || {}) as DeveloperWebhookCreateInput));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/developer/webhooks/:webhookId', async (req, res) => {
  try {
    res.json({
      webhook: await updateDeveloperWebhook(
        req.authedUser!.id,
        req.params.webhookId,
        (req.body || {}) as DeveloperWebhookUpdateInput,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/developer/webhooks/:webhookId', async (req, res) => {
  try {
    res.json(await deleteDeveloperWebhook(req.authedUser!.id, req.params.webhookId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const notificationId =
      req.body && typeof req.body.notificationId === 'string' ? req.body.notificationId : null;
    const markAll = Boolean(req.body?.markAll);
    await markNotificationsRead(req.authedUser!.id, {
      notificationId,
      markAll,
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/notifications/preferences', async (req, res) => {
  try {
    const preferences = await saveNotificationPreferences(
      req.authedUser!.id,
      req.body as NotificationPreferencesUpdateInput,
    );
    res.json({ preferences });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/connection', async (req, res) => {
  try {
    res.json({
      connection: await getStoredEmailConnection(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/connection/verify', async (req, res) => {
  try {
    res.json(await verifyEmailConnectionInput(req.body as EmailConnectionUpsertInput));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/connection', async (req, res) => {
  try {
    res.json({
      connection: await saveEmailConnection(req.authedUser!.id, req.body as EmailConnectionUpsertInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/email/connection', async (req, res) => {
  try {
    res.json(await deleteEmailConnection(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/inbox', async (req, res) => {
  try {
    res.json({
      messages: await fetchEmailInbox(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/templates', async (req, res) => {
  try {
    res.json({
      templates: await getEmailTemplates(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/templates', async (req, res) => {
  try {
    res.json({
      template: await saveEmailTemplate(req.authedUser!.id, req.body as EmailTemplateSaveInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/email/templates/:templateId', async (req, res) => {
  try {
    res.json(await deleteEmailTemplate(req.authedUser!.id, req.params.templateId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/email/campaigns', async (req, res) => {
  try {
    res.json({
      campaigns: await getEmailCampaigns(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/email/campaigns/send', async (req, res) => {
  try {
    res.json({
      campaign: await sendEmailCampaign(req.authedUser!.id, req.body as EmailCampaignSendInput),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/meta-lead-capture', async (req, res) => {
  try {
    res.json(await getMetaLeadCaptureSetup(req.authedUser!.id, req));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-lead-capture', async (req, res) => {
  try {
    res.json(
      await saveMetaLeadCaptureSetup(
        req.authedUser!.id,
        req.body as MetaLeadCaptureSetupInput,
        req,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-lead-capture/connect', async (req, res) => {
  try {
    res.json(
      await connectMetaLeadCaptureSetup(
        req.authedUser!.id,
        req.body as MetaLeadCaptureConnectionInput,
        req,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-lead-capture/subscribe-pages', async (req, res) => {
  try {
    res.json(await activateMetaLeadCapturePageSubscriptions(req.authedUser!.id, req));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/meta-ads', async (req, res) => {
  try {
    res.json(await getMetaAdsIntegrationSetup(req.authedUser!.id, { includeLiveAssets: true }));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-ads/options', async (req, res) => {
  try {
    const { accessToken, flowState } = req.body as MetaAdsIntegrationOptionsInput;
    assertMetaOAuthFlowState(flowState, 'ads_flow');
    const normalizedAccessToken = normalizeOptionalString(accessToken);

    if (!normalizedAccessToken) {
      throw new Error('Facebook access token is required.');
    }

    const assets = await fetchMetaAdsAssets(normalizedAccessToken);
    res.json({
      config: null,
      pages: assets.pages,
      adAccounts: assets.adAccounts,
    } satisfies MetaAdsIntegrationSetupResponse);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/meta-ads', async (req, res) => {
  try {
    res.json(await saveMetaAdsIntegration(req.authedUser!.id, req.body as MetaAdsIntegrationSaveInput));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/integrations/meta-ads', async (req, res) => {
  try {
    res.json(await disconnectMetaAdsIntegration(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta-ads/campaigns', async (req, res) => {
  try {
    res.json(
      await fetchMetaAdsCampaigns(req.authedUser!.id, {
        period: req.query.period,
        since: req.query.since,
        until: req.query.until,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta-ads/campaigns/:campaignId/status', async (req, res) => {
  try {
    res.json(
      await updateMetaAdsCampaignStatus(
        req.authedUser!.id,
        req.params.campaignId,
        req.body as MetaAdsCampaignStatusUpdateInput,
      ),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta-ads/media', async (req, res) => {
  try {
    res.json(await fetchMetaAdsMediaLibrary(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta-ads/create/setup', async (req, res) => {
  try {
    res.json(await getMetaAdsCreationSetup(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/integrations/woocommerce', async (req, res) => {
  try {
    const connection = await getWooCommerceConnection(req.authedUser!.id);
    res.json({
      connection,
      callbackUrl: getWooCommerceCallbackUrl(req, req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/woocommerce/verify', async (req, res) => {
  try {
    res.json(await verifyWooCommerceConnectionInput(req.body as WooCommerceConnectionVerifyInput));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/integrations/woocommerce', async (req, res) => {
  try {
    const response = await saveWooCommerceConnection(
      req.authedUser!.id,
      req.body as WooCommerceConnectionInput,
    );
    res.json({
      ...response,
      callbackUrl: getWooCommerceCallbackUrl(req, req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/integrations/woocommerce/automations', async (req, res) => {
  try {
    const connection = await updateWooCommerceAutomations(
      req.authedUser!.id,
      Array.isArray(req.body?.automations) ? req.body.automations : [],
    );
    res.json({
      connection,
      callbackUrl: getWooCommerceCallbackUrl(req, req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/integrations/woocommerce', async (req, res) => {
  try {
    const { error } = await adminSupabase
      .from('woocommerce_connections')
      .delete()
      .eq('user_id', req.authedUser!.id);

    if (error) {
      throw error;
    }

    res.json({ ok: true });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('A file upload is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const uploaded = await uploadRemoteMedia(accessToken, String(row.phone_number_id), {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileName: req.file.originalname || 'attachment',
    });

    res.json({
      mediaId: uploaded.id,
      mediaType: guessMediaTypeFromMime(req.file.mimetype),
      fileName: req.file.originalname || 'attachment',
      mimeType: req.file.mimetype || 'application/octet-stream',
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/media/:mediaId', async (req, res) => {
  try {
    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const metadata = await fetchRemoteMediaMetadata(accessToken, req.params.mediaId);

    if (!metadata.url) {
      throw new Error('Media URL was not returned by Meta.');
    }

    const response = await fetch(metadata.url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download media from Meta (${response.status}).`);
    }

    const requestedName = normalizeOptionalString(req.query.fileName);
    if (requestedName) {
      res.setHeader('Content-Disposition', `inline; filename="${requestedName.replace(/"/g, '')}"`);
    }
    if (metadata.mime_type) {
      res.setHeader('Content-Type', metadata.mime_type);
    }
    if (metadata.file_size) {
      res.setHeader('Content-Length', String(metadata.file_size));
    }

    Readable.fromWeb(response.body as any).pipe(res);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const input = req.body as ProfileUpsertInput;
    const protectedBillingFields: Array<keyof ProfileUpsertInput> = [
      'selectedPlan',
      'billingCycle',
      'billingStatus',
      'trialEndsAt',
      'freeTrialStartedAt',
      'couponCode',
      'razorpaySubscriptionId',
    ];

    if (protectedBillingFields.some((field) => field in input)) {
      throw new Error('Billing fields must be updated through the billing endpoints.');
    }

    const next = await upsertProfile(req.authedUser!, input);
    res.json({ profile: next });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/profile/photo', upload.single('file'), async (req, res) => {
  let uploadedProfilePictureUrl: string | null = null;

  try {
    if (!req.file) {
      throw new Error('A profile picture upload is required.');
    }

    if (!isSupportedAppProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Profile picture must be a PNG or JPEG image.');
    }

    if (req.file.size > MAX_APP_PROFILE_PHOTO_BYTES) {
      throw new Error('Profile picture must be 5 MB or smaller.');
    }

    uploadedProfilePictureUrl = await uploadAppProfilePhoto({
      userId: req.authedUser!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      purpose: 'profile-picture',
    });

    const profile = await upsertProfile(req.authedUser!, {
      profilePictureUrl: uploadedProfilePictureUrl,
    });

    res.json({ profile });
  } catch (error) {
    if (uploadedProfilePictureUrl) {
      await deleteStoredAppProfilePhoto(uploadedProfilePictureUrl).catch(() => undefined);
    }

    sendError(res, 400, error);
  }
});

app.post('/api/profile/company-logo', upload.single('file'), async (req, res) => {
  let uploadedCompanyLogoUrl: string | null = null;

  try {
    if (!req.file) {
      throw new Error('A company logo upload is required.');
    }

    if (!isSupportedAppProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Company logo must be a PNG or JPEG image.');
    }

    if (req.file.size > MAX_APP_PROFILE_PHOTO_BYTES) {
      throw new Error('Company logo must be 5 MB or smaller.');
    }

    uploadedCompanyLogoUrl = await uploadAppProfilePhoto({
      userId: req.authedUser!.id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      purpose: 'company-logo',
    });

    const profile = await upsertProfile(req.authedUser!, {
      companyLogoUrl: uploadedCompanyLogoUrl,
    });

    res.json({ profile });
  } catch (error) {
    if (uploadedCompanyLogoUrl) {
      await deleteStoredAppProfilePhoto(uploadedCompanyLogoUrl).catch(() => undefined);
    }

    sendError(res, 400, error);
  }
});

app.delete('/api/account', async (req, res) => {
  try {
    res.json(await deleteAccount(req.authedUser!));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/team/members', async (req, res) => {
  try {
    res.json({ members: await getWorkspaceTeamMembers(req.authedUser!) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/team/invite', async (req, res) => {
  try {
    const member = await inviteWorkspaceTeamMember(req.authedUser!, req.body as InviteWorkspaceUserInput);
    res.json({
      member,
      inviteSent: true,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/team/members/:memberId', async (req, res) => {
  try {
    const member = await updateWorkspaceTeamMember(
      req.authedUser!,
      req.params.memberId,
      req.body as UpdateWorkspaceTeamMemberInput,
    );
    res.json({ member });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/team/members/:memberId', async (req, res) => {
  try {
    res.json(await removeWorkspaceTeamMember(req.authedUser!, req.params.memberId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/workspace/options', async (req, res) => {
  try {
    res.json({ options: await getWorkspaceOptionDefinitions(req.authedUser!) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/workspace/options', async (req, res) => {
  try {
    const option = await createWorkspaceOptionDefinition(req.authedUser!, req.body as WorkspaceOptionInput);
    res.json({ option });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/workspace/options/:optionId', async (req, res) => {
  try {
    res.json(await deleteWorkspaceOptionDefinition(req.authedUser!, req.params.optionId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/trial/start', async (req, res) => {
  try {
    const profile = await startFreeTrial(req.authedUser!);
    res.json({ profile });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/billing/plans', async (_req, res) => {
  try {
    res.json({
      plans: await loadBillingPlans(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/quote', async (req, res) => {
  try {
    const { quote } = await getBillingQuote(req.body as BillingQuoteInput);
    res.json({ quote });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/subscription', async (req, res) => {
  try {
    const { planCode, billingCycle, couponCode } = req.body as BillingQuoteInput;

    const { subscription, quote } = await createRazorpaySubscription({
      userId: req.authedUser!.id,
      userEmail: req.authedUser!.email,
      planCode,
      billingCycle,
      couponCode,
    });

    res.json({
      keyId: razorpayKeyId,
      subscriptionId: subscription.id,
      businessName: razorpayBusinessName,
      businessLogoUrl: razorpayBusinessLogoUrl || null,
      quote,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/billing/subscription/verify', async (req, res) => {
  try {
    const {
      razorpayPaymentId,
      razorpaySubscriptionId,
      razorpaySignature,
    } = req.body as {
      razorpayPaymentId: string;
      razorpaySubscriptionId: string;
      razorpaySignature: string;
    };

    if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
      throw new Error('razorpayPaymentId, razorpaySubscriptionId, and razorpaySignature are required.');
    }

    verifyRazorpaySubscriptionSignature({
      paymentId: razorpayPaymentId,
      subscriptionId: razorpaySubscriptionId,
      signature: razorpaySignature,
    });

    const subscription = await fetchRazorpaySubscription(razorpaySubscriptionId);
    const planCode = subscription.notes?.plan_code as BillingPlanCode | undefined;
    const billingCycle = normalizeBillingCycle(subscription.notes?.billing_cycle);
    const couponCode = normalizeCouponCode(subscription.notes?.coupon_code);
    const trialEndsAt =
      (typeof subscription.notes?.trial_ends_at === 'string' && subscription.notes.trial_ends_at) ||
      (subscription.start_at ? new Date(subscription.start_at * 1000).toISOString() : null);

    if (!planCode) {
      throw new Error('Razorpay subscription notes are missing plan metadata.');
    }

    if (!billingCycle) {
      throw new Error('Razorpay subscription notes are missing billing cycle metadata.');
    }

    const plan = getBillingPlan(planCode, await loadBillingPlans());

    if (!plan) {
      throw new Error('The saved Razorpay plan is not recognized by the app catalog.');
    }

    const profile = await upsertProfile(req.authedUser!, {
      selectedPlan: plan.name,
      billingCycle,
      billingStatus: resolvePersistedBillingStatus(subscription, trialEndsAt),
      trialEndsAt,
      couponCode,
      razorpaySubscriptionId,
    });

    res.json({ profile });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/wallet/topup', async (req, res) => {
  let pendingTransactionId: string | null = null;

  try {
    if (!enablePlatformWallet) {
      throw new Error('Platform wallet is currently disabled.');
    }

    requireRazorpayCredentials();

    const input = req.body as CreateWalletTopupInput;
    const amount = Number(input.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('A valid wallet top-up amount is required.');
    }

    const preferredCurrency = await getProfilePreferredCurrency(req.authedUser!.id);
    const walletRow = await ensureWalletForUser(req.authedUser!.id, preferredCurrency);

    if (!walletRow) {
      throw new Error('Wallet tables are not available. Apply supabase/schema.sql before using top-ups.');
    }

    const currency = normalizeCurrencyCode(input.currency || walletRow.currency || preferredCurrency || 'USD');
    const transaction = await createWalletTransaction({
      walletId: String(walletRow.id),
      amount,
      currency,
      type: 'credit',
      source: 'razorpay',
      purpose: 'addon',
      status: 'pending',
      description: buildWalletTopupDescription(amount, currency),
      metadata: {
        initiatedByUserId: req.authedUser!.id,
        initiatedAt: new Date().toISOString(),
      },
    });

    pendingTransactionId = String(transaction.id);

    const order = await createRazorpayOrder({
      userId: req.authedUser!.id,
      walletId: String(walletRow.id),
      transactionId: pendingTransactionId,
      amount,
      currency,
    });

    const currentMetadata = isRecord(transaction.metadata) ? transaction.metadata : {};
    const transactionUpdateResult = await adminSupabase
      .from('transactions')
      .update({
        external_reference: order.id,
        metadata: {
          ...currentMetadata,
          razorpayOrderId: order.id,
          razorpayOrderStatus: order.status,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', pendingTransactionId);

    if (transactionUpdateResult.error) {
      throw transactionUpdateResult.error;
    }

    res.json({
      keyId: razorpayKeyId,
      orderId: order.id,
      transactionId: pendingTransactionId,
      amount,
      currency,
      businessName: razorpayBusinessName,
      businessLogoUrl: razorpayBusinessLogoUrl || null,
      wallet: await getWalletForUser(req.authedUser!),
    });
  } catch (error) {
    if (pendingTransactionId) {
      const transactionErrorUpdate = await adminSupabase
        .from('transactions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pendingTransactionId);

      if (transactionErrorUpdate.error) {
        console.error('Failed to mark wallet transaction as failed:', transactionErrorUpdate.error);
      }
    }

    sendError(res, 400, error);
  }
});

app.post('/api/wallet/topup/verify', async (req, res) => {
  try {
    if (!enablePlatformWallet) {
      throw new Error('Platform wallet is currently disabled.');
    }

    const {
      transactionId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body as VerifyWalletTopupInput;

    if (!transactionId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new Error('transactionId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.');
    }

    verifyRazorpayOrderSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    const transactionResult = await adminSupabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (transactionResult.error) {
      throw transactionResult.error;
    }

    if (!transactionResult.data) {
      throw new Error('Wallet transaction was not found.');
    }

    const transactionRow = transactionResult.data as Record<string, unknown>;
    const walletId = normalizeOptionalIdentifier(transactionRow.wallet_id);

    if (!walletId) {
      throw new Error('Wallet transaction is missing its wallet reference.');
    }

    const walletResult = await adminSupabase.from('wallets').select('*').eq('id', walletId).maybeSingle();

    if (walletResult.error) {
      throw walletResult.error;
    }

    if (!walletResult.data) {
      throw new Error('Wallet was not found.');
    }

    const walletRow = walletResult.data as Record<string, unknown>;
    const requestOrgId = await resolveWorkspaceOwnerUserId(req.authedUser!.id);
    const walletOrgId = normalizeOptionalIdentifier(walletRow.org_id) || normalizeOptionalIdentifier(walletRow.user_id);

    if (!walletOrgId || walletOrgId !== requestOrgId) {
      throw new Error('This wallet transaction does not belong to your workspace.');
    }

    const payment = await fetchRazorpayPayment(razorpayPaymentId);

    if (payment.order_id !== razorpayOrderId) {
      throw new Error('Razorpay payment does not match the expected order.');
    }

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw new Error(`Razorpay payment is ${payment.status}.`);
    }

    const transactionAmount = Number(transactionRow.amount || 0);
    const transactionCurrency = normalizeCurrencyCode(transactionRow.currency);

    if (payment.amount !== majorAmountToMinorUnits(transactionAmount)) {
      throw new Error('Razorpay payment amount does not match the wallet top-up request.');
    }

    if (normalizeCurrencyCode(payment.currency) !== transactionCurrency) {
      throw new Error('Razorpay payment currency does not match the wallet top-up request.');
    }

    const transactionStatus = normalizeWalletTransactionStatus(transactionRow.status);

    if (transactionStatus === 'successful') {
      res.json({ wallet: await getWalletForUser(req.authedUser!) });
      return;
    }

    if (transactionStatus !== 'pending') {
      throw new Error(`Wallet transaction cannot be verified from ${transactionStatus} state.`);
    }

    const currentMetadata = isRecord(transactionRow.metadata) ? transactionRow.metadata : {};
    const promoteTransactionResult = await adminSupabase
      .from('transactions')
      .update({
        status: 'successful',
        external_reference: razorpayPaymentId,
        metadata: {
          ...currentMetadata,
          razorpayOrderId,
          razorpayPaymentId,
          razorpayPaymentStatus: payment.status,
          verifiedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (promoteTransactionResult.error) {
      throw promoteTransactionResult.error;
    }

    if (promoteTransactionResult.data) {
      const walletUpdateResult = await adminSupabase
        .from('wallets')
        .update({
          available_balance: Number(walletRow.available_balance || 0) + transactionAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      if (walletUpdateResult.error) {
        throw walletUpdateResult.error;
      }
    }

    res.json({ wallet: await getWalletForUser(req.authedUser!) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/connect/manual', async (req, res) => {
  try {
    const { accessToken, setupType, wabaId, phoneNumberId } = req.body as {
      accessToken: string;
      setupType: string;
      wabaId: string;
      phoneNumberId: string;
    };

    if (!accessToken || !wabaId || !phoneNumberId || !setupType) {
      throw new Error('setupType, accessToken, wabaId, and phoneNumberId are required.');
    }

    const [phone, waba, reusableAssets] = await Promise.all([
      fetchPhoneNumber(accessToken, phoneNumberId),
      fetchWaba(accessToken, wabaId),
      fetchReusableMetaSetupAssets(accessToken),
    ]);

    let channel = await saveMetaChannel({
      userId: req.authedUser!.id,
      setupType,
      connectionMethod: 'manual',
      accessToken,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      messagingLimitTier: getNormalizedMessagingLimitTier(phone),
      businessAccountName: waba.name || null,
      metadataPatch: {
        reusableMetaSetup: buildReusableMetaSetupContext({
          source: 'manual_waba_connection',
          setupType,
          connectionMethod: 'manual',
          accessToken,
          wabaId,
          phoneNumberId,
          displayPhoneNumber: phone.display_phone_number || null,
          verifiedName: phone.verified_name || null,
          qualityRating: phone.quality_rating || null,
          messagingLimitTier: getNormalizedMessagingLimitTier(phone),
          businessAccountName: waba.name || null,
          reusableAssets,
        }),
      },
    });

    let savedChannelRow = await getMetaChannelRow(req.authedUser!.id);

    if (savedChannelRow) {
      const registration = await autoRegisterWhatsAppSenderForChannel({
        userId: req.authedUser!.id,
        row: savedChannelRow,
        accessToken,
        reason: 'channel_connected',
      });
      savedChannelRow = registration.row;

      await seedMetaLeadCaptureFromReusableSetup({
        userId: req.authedUser!.id,
        metaChannelId: String(savedChannelRow.id),
        accessToken,
        reusableAssets,
      }).catch((error) => {
        console.warn('Failed to seed Meta Lead Capture from reusable Meta setup.', error);
      });

      const syncedRow = await syncWhatsAppWebhookSubscription({
        userId: req.authedUser!.id,
        row: savedChannelRow,
        accessToken,
        req,
      });
      channel = mapChannel(syncedRow);
    }

    await syncTemplates(req.authedUser!.id);
    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/connect/embedded', async (req, res) => {
  try {
    const { code, setupType, wabaId, phoneNumberId, redirectUri, setupContext, flowState, oauthState } =
      req.body as EmbeddedMetaConnectionInput;

    if (!code || !wabaId || !phoneNumberId || !setupType) {
      throw new Error('code, setupType, wabaId, and phoneNumberId are required.');
    }

    const mergedSetupContext = {
      ...(isRecord(setupContext) ? setupContext : {}),
      flowState:
        normalizeOptionalString(setupContext?.flowState) ||
        normalizeOptionalString(flowState) ||
        'core_onboarding',
      oauthState:
        normalizeOptionalString(setupContext?.oauthState) ||
        normalizeOptionalString(oauthState),
    };
    assertMetaOAuthFlowState(mergedSetupContext.flowState, 'core_onboarding');

    const accessToken = await exchangeEmbeddedSignupCode(code, {
      redirectUri,
      requestReferer: req.get('referer') || undefined,
      requestOrigin: req.get('origin') || undefined,
    });
    const [phone, waba, reusableAssets] = await Promise.all([
      fetchPhoneNumber(accessToken, phoneNumberId),
      fetchWaba(accessToken, wabaId),
      fetchReusableMetaSetupAssets(accessToken),
    ]);

    let channel = await saveMetaChannel({
      userId: req.authedUser!.id,
      setupType,
      connectionMethod: 'embedded_signup',
      accessToken,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      messagingLimitTier: getNormalizedMessagingLimitTier(phone),
      businessAccountName: waba.name || null,
      metadataPatch: {
        reusableMetaSetup: buildReusableMetaSetupContext({
          source: 'waba_embedded_signup',
          setupType,
          connectionMethod: 'embedded_signup',
          accessToken,
          wabaId,
          phoneNumberId,
          displayPhoneNumber: phone.display_phone_number || null,
          verifiedName: phone.verified_name || null,
          qualityRating: phone.quality_rating || null,
          messagingLimitTier: getNormalizedMessagingLimitTier(phone),
          businessAccountName: waba.name || null,
          setupContext: mergedSetupContext,
          reusableAssets,
        }),
      },
    });

    let savedChannelRow = await getMetaChannelRow(req.authedUser!.id);

    if (savedChannelRow) {
      const registration = await autoRegisterWhatsAppSenderForChannel({
        userId: req.authedUser!.id,
        row: savedChannelRow,
        accessToken,
        reason: 'channel_connected',
      });
      savedChannelRow = registration.row;

      await seedMetaLeadCaptureFromReusableSetup({
        userId: req.authedUser!.id,
        metaChannelId: String(savedChannelRow.id),
        accessToken,
        reusableAssets,
      }).catch((error) => {
        console.warn('Failed to seed Meta Lead Capture from reusable Meta setup.', error);
      });

      const syncedRow = await syncWhatsAppWebhookSubscription({
        userId: req.authedUser!.id,
        row: savedChannelRow,
        accessToken,
        req,
      });
      channel = mapChannel(syncedRow);
    }

    await syncTemplates(req.authedUser!.id);
    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/oauth/exchange', async (req, res) => {
  try {
    const { code, redirectUri, flowState, oauthState } =
      req.body as MetaOAuthCodeExchangeInput;
    const normalizedCode = normalizeOptionalString(code);
    const normalizedRedirectUri = normalizeOptionalString(redirectUri);
    const normalizedFlowState = normalizeMetaOAuthFlowState(flowState);

    if (!normalizedCode || !normalizedRedirectUri) {
      throw new Error('code and redirectUri are required.');
    }

    if (!normalizedFlowState) {
      throw new Error('A valid Meta OAuth flow state is required.');
    }

    const accessToken = await exchangeEmbeddedSignupCode(normalizedCode, {
      redirectUri: normalizedRedirectUri,
      requestReferer: req.get('referer') || undefined,
      requestOrigin: req.get('origin') || undefined,
    });

    res.json({
      accessToken,
      flowState: normalizedFlowState,
      oauthState: normalizeOptionalString(oauthState),
    } satisfies MetaOAuthCodeExchangeResponse);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/register', async (req, res) => {
  try {
    const rawPin = (req.body as { pin?: unknown } | undefined)?.pin;
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const registration = await autoRegisterWhatsAppSenderForChannel({
      userId: req.authedUser!.id,
      row,
      accessToken,
      rawPin,
      reason: 'manual',
      throwOnError: true,
    });

    const syncedRow = await syncWhatsAppWebhookSubscription({
      userId: req.authedUser!.id,
      row: registration.row,
      accessToken,
      req,
    });

    res.json({
      channel: mapChannel(syncedRow),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/channel/webhook-subscription', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const syncedRow = await checkWhatsAppWebhookSubscription({
      userId: req.authedUser!.id,
      row,
      accessToken,
      req,
    });

    res.json({
      channel: mapChannel(syncedRow),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/webhook-subscription', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const syncedRow = await syncWhatsAppWebhookSubscription({
      userId: req.authedUser!.id,
      row,
      accessToken,
      req,
      throwOnError: true,
    });

    res.json({
      channel: mapChannel(syncedRow),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/channel/webhook-subscription', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const syncedRow = await deactivateWhatsAppWebhookSubscription({
      userId: req.authedUser!.id,
      row,
      accessToken,
      req,
    });

    res.json({
      channel: mapChannel(syncedRow),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/two-step-verification', async (req, res) => {
  try {
    const pin = normalizeMetaRegistrationPin((req.body as { pin?: unknown }).pin);
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await updateWhatsAppBusinessPhoneNumberTwoStepVerification(
      accessToken,
      String(row.phone_number_id),
      pin,
    );

    const updateTimestamp = new Date().toISOString();
    const currentMetadata = getMetaChannelMetadataRecord(row);
    const currentTwoStepVerification = isRecord(currentMetadata.twoStepVerification)
      ? (currentMetadata.twoStepVerification as Record<string, unknown>)
      : {};
    const senderRegistration = isRecord(currentMetadata.senderRegistration)
      ? (currentMetadata.senderRegistration as Record<string, unknown>)
      : {};
    const enabledAt =
      normalizeOptionalString(currentTwoStepVerification.enabledAt) ||
      normalizeOptionalString(senderRegistration.registeredAt) ||
      updateTimestamp;

    const { data, error } = await adminSupabase
      .from('meta_channels')
      .update({
        status: 'connected',
        metadata: {
          ...currentMetadata,
          twoStepVerification: {
            ...currentTwoStepVerification,
            enabledAt,
            lastPinUpdatedAt: updateTimestamp,
            disabledAt: null,
          },
        },
        last_synced_at: updateTimestamp,
        updated_at: updateTimestamp,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      channel: mapChannel(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/request-code', async (req, res) => {
  try {
    const codeMethod = normalizeMetaVerificationCodeMethod(
      (req.body as { codeMethod?: unknown }).codeMethod,
    );
    const language = normalizeMetaVerificationCodeLanguage(
      (req.body as { language?: unknown }).language,
    );
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);

    await requestWhatsAppBusinessPhoneNumberVerificationCode(
      accessToken,
      String(row.phone_number_id),
      {
        codeMethod,
        language,
      },
    );

    const currentMetadata = getMetaChannelMetadataRecord(row);
    const requestTimestamp = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_channels')
      .update({
        metadata: {
          ...currentMetadata,
          verificationCodeRequest: {
            lastRequestedAt: requestTimestamp,
            codeMethod,
            language,
          },
        },
        updated_at: requestTimestamp,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({ channel: mapChannel(data as Record<string, unknown>) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/verify-code', async (req, res) => {
  try {
    const code = normalizeMetaVerificationCode((req.body as { code?: unknown }).code);
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const verificationResult = await verifyWhatsAppBusinessPhoneNumberVerificationCode(
      accessToken,
      String(row.phone_number_id),
      code,
    );

    const currentMetadata = getMetaChannelMetadataRecord(row);
    const currentVerificationCodeRequest = isRecord(currentMetadata.verificationCodeRequest)
      ? (currentMetadata.verificationCodeRequest as Record<string, unknown>)
      : {};
    const verificationTimestamp = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_channels')
      .update({
        metadata: {
          ...currentMetadata,
          verificationCodeRequest: {
            ...currentVerificationCodeRequest,
            lastVerifiedAt: verificationTimestamp,
            verifiedPhoneNumberId: verificationResult.id || String(row.phone_number_id),
          },
        },
        updated_at: verificationTimestamp,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({ channel: mapChannel(data as Record<string, unknown>) });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/channel/deregister', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await deregisterWhatsAppBusinessPhoneNumber(accessToken, String(row.phone_number_id));

    const deregistrationTimestamp = new Date().toISOString();
    const currentMetadata = getMetaChannelMetadataRecord(row);
    const currentTwoStepVerification = isRecord(currentMetadata.twoStepVerification)
      ? (currentMetadata.twoStepVerification as Record<string, unknown>)
      : {};

    const { data, error } = await adminSupabase
      .from('meta_channels')
      .update({
        status: 'connected',
        metadata: {
          ...currentMetadata,
          senderRegistration: {
            registeredAt: null,
            deregisteredAt: deregistrationTimestamp,
          },
          twoStepVerification: {
            ...currentTwoStepVerification,
            enabledAt: null,
            disabledAt: deregistrationTimestamp,
          },
        },
        last_synced_at: deregistrationTimestamp,
        updated_at: deregistrationTimestamp,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', row.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      channel: mapChannel(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/channel', async (req, res) => {
  try {
    res.json(await disconnectMetaChannel(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/instagram/connect/options', async (req, res) => {
  try {
    const { longLivedToken, accessToken } = req.body as {
      longLivedToken?: string;
      accessToken?: string;
    };
    const normalizedToken = await resolveInstagramBusinessToken(
      req.authedUser!.id,
      longLivedToken,
      accessToken,
    );
    const accounts = await listInstagramConnectableAccounts(normalizedToken);

    if (accounts.length === 0) {
      throw new Error(
        'Meta did not return any Instagram Professional account connected to a Facebook Page for this login.',
      );
    }

    res.json({ accounts });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/instagram/connect/business-login', async (req, res) => {
  try {
    const { longLivedToken, accessToken, pageId } = req.body as ConnectInstagramBusinessLoginInput;
    const normalizedToken = await resolveInstagramBusinessToken(
      req.authedUser!.id,
      longLivedToken,
      accessToken,
    );
    const pages = await fetchInstagramPages(normalizedToken);
    const connectablePages = pages.filter(
      (page) =>
        normalizeOptionalString(page.access_token) &&
        normalizeOptionalString(page.instagram_business_account?.id),
    );

    if (connectablePages.length === 0) {
      throw new Error(
        'Meta did not return any Instagram Professional account connected to a Facebook Page for this login.',
      );
    }

    const selectedPage =
      (pageId
        ? connectablePages.find((page) => String(page.id) === pageId)
        : connectablePages.length === 1
          ? connectablePages[0]
          : null) || null;

    if (!selectedPage) {
      throw new Error('Select the Instagram account you want to connect before saving it.');
    }

    const pageAccessToken = normalizeOptionalString(selectedPage.access_token);
    const instagramAccountId = normalizeOptionalString(selectedPage.instagram_business_account?.id);

    if (!pageAccessToken || !instagramAccountId) {
      throw new Error('Meta returned an incomplete Instagram account payload for the selected Page.');
    }

    const profile = await fetchInstagramAccountProfile(
      normalizedToken,
      pageAccessToken,
      instagramAccountId,
    ).catch(() => null);
    const channel = await saveInstagramChannel({
      userId: req.authedUser!.id,
      userAccessToken: normalizedToken,
      pageAccessToken,
      pageId: String(selectedPage.id),
      pageName: normalizeOptionalString(selectedPage.name),
      instagramAccountId,
      instagramUsername: normalizeOptionalString(profile?.username),
      instagramName: normalizeOptionalString(profile?.name),
      profilePictureUrl: normalizeOptionalString(profile?.profile_picture_url),
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/instagram/channel', async (req, res) => {
  try {
    res.json(await disconnectInstagramChannel(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/instagram/channel/webhook-subscription', async (req, res) => {
  try {
    const channel = await activateInstagramWebhookSubscription(req.authedUser!.id);
    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/options', async (req, res) => {
  try {
    const { accessToken } = req.body as {
      accessToken?: string;
    };
    const normalizedAccessToken = await resolveReusableMetaAccessToken(
      req.authedUser!.id,
      accessToken,
      'Messenger setup',
    );
    const pages = await listMessengerConnectablePages(normalizedAccessToken);

    if (pages.length === 0) {
      throw new Error(
        'Meta did not return any Facebook Pages with a usable Page access token for this login.',
      );
    }

    res.json({ pages });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/facebook-login', async (req, res) => {
  try {
    const { accessToken, pageId } = req.body as ConnectMessengerPageLoginInput;
    const normalizedAccessToken = await resolveReusableMetaAccessToken(
      req.authedUser!.id,
      accessToken,
      'Messenger setup',
    );
    const pages = await fetchMessengerPages(normalizedAccessToken);
    const connectablePages = pages.filter(
      (page) =>
        normalizeOptionalIdentifier(page.id) &&
        normalizeOptionalString(page.access_token),
    );

    if (connectablePages.length === 0) {
      throw new Error(
        'Meta did not return any Facebook Pages with a usable Page access token for this login.',
      );
    }

    const selectedPage =
      (pageId
        ? connectablePages.find((page) => String(page.id) === pageId)
        : connectablePages.length === 1
          ? connectablePages[0]
          : null) || null;

    if (!selectedPage) {
      throw new Error('Select the Facebook Page you want to connect before saving Messenger.');
    }

    const pageAccessToken = normalizeOptionalString(selectedPage.access_token);
    const normalizedPageId = normalizeOptionalIdentifier(selectedPage.id);

    if (!pageAccessToken || !normalizedPageId) {
      throw new Error('Meta returned an incomplete Facebook Page payload for the selected Page.');
    }

    const channel = await connectMessengerChannel({
      userId: req.authedUser!.id,
      connectionMethod: 'facebook_login',
      pageId: normalizedPageId,
      pageAccessToken,
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/connect/manual', async (req, res) => {
  try {
    const { pageId, pageAccessToken } = req.body as {
      pageId?: string;
      pageAccessToken?: string;
    };

    if (!pageId?.trim() || !pageAccessToken?.trim()) {
      throw new Error('pageId and pageAccessToken are required.');
    }

    const channel = await connectMessengerChannel({
      userId: req.authedUser!.id,
      connectionMethod: 'manual',
      pageId,
      pageAccessToken,
    });

    res.json({ channel });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/messenger/channel', async (req, res) => {
  try {
    res.json(await disconnectMessengerChannel(req.authedUser!.id));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/messenger/channel/sync-conversations', async (req, res) => {
  try {
    const { row, accessToken } = await getMessengerChannelWithToken(req.authedUser!.id);
    const pageId = normalizeOptionalIdentifier(row.page_id);

    if (!pageId) {
      throw new Error('Messenger Page ID is missing from the connected channel.');
    }

    const result = await syncMessengerPageConversations({
      userId: req.authedUser!.id,
      pageId,
      pageName: normalizeOptionalString(row.page_name),
      pageAccessToken: accessToken,
    });

    res.json(result);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates/sync', async (req, res) => {
  try {
    res.json({
      templates: await syncTemplates(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates/header-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('A template header media file is required.');
    }

    const file = {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileName: req.file.originalname || 'template-header-media',
    };
    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const [uploaded, headerMediaPreviewUrl] = await Promise.all([
      uploadTemplateHeaderMedia(accessToken, file),
      saveTemplateHeaderMediaPreviewWithFallback(req, req.authedUser!.id, file),
    ]);

    res.json({
      headerMediaHandle: uploaded.headerMediaHandle,
      headerMediaPreviewUrl,
      fileName: file.fileName,
      mimeType: file.mimeType,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const {
      name,
      category,
      language,
      body,
      headerType,
      headerText,
      headerMediaHandle,
      headerMediaSampleUrl,
      headerMediaPreviewUrl,
      headerMediaFileName,
      headerMediaMimeType,
      footer,
      buttons,
    } = req.body as CreateTemplateInput;

    if (!name || !category || !language || !body) {
      throw new Error('name, category, language, and body are required.');
    }

    if (!/^[a-z0-9_]+$/.test(name)) {
      throw new Error('Template name may only contain lowercase letters, numbers, and underscores.');
    }

    const components: Array<Record<string, unknown>> = [];
    const normalizedHeaderType = headerType || 'NONE';
    const headerMediaPreview = normalizeOptionalString(headerMediaPreviewUrl)
      ? {
          url: String(headerMediaPreviewUrl),
          fileName: normalizeOptionalString(headerMediaFileName),
          mimeType: normalizeOptionalString(headerMediaMimeType),
        }
      : null;

    if (normalizedHeaderType === 'TEXT') {
      if (!headerText?.trim()) {
        throw new Error('Header text is required when the campaign title type is Text.');
      }

      const headerComponent: Record<string, unknown> = {
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      };

      const headerExamples = buildTemplateExamples(headerText.trim());
      if (headerExamples) {
        headerComponent.example = {
          header_text: headerExamples,
        };
      }

      components.push(headerComponent);
    }

    if (normalizedHeaderType === 'IMAGE' || normalizedHeaderType === 'VIDEO' || normalizedHeaderType === 'DOCUMENT') {
      const normalizedHeaderMediaHandle =
        normalizeOptionalString(headerMediaHandle) || normalizeOptionalString(headerMediaSampleUrl);

      if (!normalizedHeaderMediaHandle) {
        throw new Error(`Upload a sample ${normalizedHeaderType.toLowerCase()} file before creating this template.`);
      }

      components.push({
        type: 'HEADER',
        format: normalizedHeaderType,
        example: {
          header_handle: [normalizedHeaderMediaHandle],
        },
      });
    }

    const bodyComponent: Record<string, unknown> = {
      type: 'BODY',
      text: body.trim(),
    };

    const bodyExamples = buildTemplateExamples(body.trim());
    if (bodyExamples) {
      bodyComponent.example = {
        body_text: [bodyExamples],
      };
    }

    components.push(bodyComponent);

    if (footer?.trim()) {
      components.push({
        type: 'FOOTER',
        text: footer.trim(),
      });
    }

    const normalizedButtons = (await Promise.all(
      (buttons || []).map(async (button) => {
        if (button.type === 'QUICK_REPLY') {
          return button.text.trim()
            ? {
                type: 'QUICK_REPLY',
                text: button.text.trim(),
              }
            : null;
        }

        if (button.type === 'FLOW') {
          const rawButton = button as Record<string, unknown>;
          const flowButtonText = normalizeOptionalString(button.text);
          const flowId = normalizeOptionalIdentifier(button.flowId ?? rawButton.flow_id);
          const flowName = normalizeOptionalString(button.flowName ?? rawButton.flow_name);
          const flowJson = normalizeTemplateFlowJson(button.flowJson ?? rawButton.flow_json);

          if (!flowButtonText) {
            return null;
          }

          if (flowButtonText.length > MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH) {
            throw new Error(`Flow button text must be ${MAX_TEMPLATE_FLOW_BUTTON_TEXT_LENGTH} characters or less.`);
          }

          const flowAction = button.flowAction === 'data_exchange' ? 'data_exchange' : 'navigate';
          const normalizedButton: Record<string, unknown> = {
            type: 'FLOW',
            text: flowButtonText,
            flow_action: flowAction,
          };
          let entryScreen: string | null = null;
          const referenceCount = [flowId, flowName, flowJson?.text].filter(Boolean).length;

          if (referenceCount !== 1) {
            throw new Error('Flow template buttons need exactly one of flow_id, flow_name, or flow_json.');
          }

          if (flowId) {
            const storedFlowRow = await findStoredFlowRowByLocalOrMetaId(req.authedUser!.id, flowId);

            if (storedFlowRow) {
              const flow = mapFlow(storedFlowRow);
              const metaFlowId = normalizeOptionalIdentifier(flow.metaFlowId);

              if (!metaFlowId) {
                throw new Error(`Flow "${flow.name}" is not synced with Meta yet.`);
              }

              if (flow.status !== 'PUBLISHED') {
                throw new Error(`Publish Flow "${flow.name}" before attaching it to a template.`);
              }

              normalizedButton.flow_id = metaFlowId;
              entryScreen = getFlowEntryScreenFromRaw(flow.raw);
            } else {
              normalizedButton.flow_id = flowId;
            }
          }

          if (flowName) {
            normalizedButton.flow_name = flowName;
          }

          if (flowJson) {
            normalizedButton.flow_json = flowJson.text;
            entryScreen = getFlowEntryScreenFromRaw({ flow_json: flowJson.raw });
          }

          if (flowAction === 'navigate') {
            normalizedButton.navigate_screen =
              normalizeOptionalString(button.navigateScreen ?? rawButton.navigate_screen) || entryScreen || undefined;
          }

          return normalizedButton;
        }

        return button.text.trim() && button.url.trim()
          ? {
              type: 'URL',
              text: button.text.trim(),
              url: button.url.trim(),
            }
          : null;
      }),
    )).filter((button): button is Record<string, unknown> => isRecord(button));

    const urlButtonCount = normalizedButtons.filter((button) => {
      return isRecord(button) && button.type === 'URL';
    }).length;
    const quickReplyButtonCount = normalizedButtons.filter((button) => {
      return isRecord(button) && button.type === 'QUICK_REPLY';
    }).length;
    const flowButtonCount = normalizedButtons.filter((button) => {
      return isRecord(button) && button.type === 'FLOW';
    }).length;

    if (
      urlButtonCount > MAX_TEMPLATE_URL_BUTTONS ||
      quickReplyButtonCount > MAX_TEMPLATE_QUICK_REPLY_BUTTONS ||
      flowButtonCount > MAX_TEMPLATE_FLOW_BUTTONS
    ) {
      throw new Error('Templates can include a maximum of 1 URL button, 2 quick reply buttons, and 1 Flow button.');
    }

    if (normalizedButtons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: normalizedButtons,
      });
    }

    await createRemoteTemplate(accessToken, String(row.waba_id), {
      name,
      category,
      language,
      components,
    });

    let templates = await syncTemplates(req.authedUser!.id);
    let created = templates.find((template) => template.name === name && template.language === language);

    if (headerMediaPreview) {
      const updatedTemplate = await saveTemplateHeaderMediaPreviewMetadata(req.authedUser!.id, name, language, headerMediaPreview);

      if (updatedTemplate) {
        templates = templates.map((template) => (template.id === updatedTemplate.id ? updatedTemplate : template));
        created = updatedTemplate;
      }
    }

    res.json({
      template: created || templates[0],
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/templates/:templateId/duplicate', async (req, res) => {
  try {
    const templateId = req.params.templateId;
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const templateResult = await adminSupabase
      .from('meta_templates')
      .select('*')
      .eq('user_id', req.authedUser!.id)
      .eq('id', templateId)
      .maybeSingle();

    if (templateResult.error) throw templateResult.error;
    if (!templateResult.data) throw new Error('Template not found.');

    const raw = templateResult.data.raw as Record<string, unknown>;
    const sourceName = String(templateResult.data.template_name);
    const bodyComponent = Array.isArray(raw.components)
      ? (raw.components as Array<Record<string, unknown>>).find((component) => component.type === 'BODY')
      : null;

    if (!bodyComponent) {
      throw new Error('Only simple body templates can be duplicated from this build.');
    }

    const duplicateName = `${sourceName}_copy_${Date.now().toString().slice(-6)}`.toLowerCase();

    await createRemoteTemplate(accessToken, String(row.waba_id), {
      name: duplicateName,
      category: String(templateResult.data.category || raw.category || 'UTILITY'),
      language: String(templateResult.data.language || raw.language || 'en_US'),
      components: raw.components as Array<Record<string, unknown>>,
    });

    const templates = await syncTemplates(req.authedUser!.id);
    const created = templates.find((template) => template.name === duplicateName);
    res.json({
      template: created || templates[0],
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/templates/:templateId', async (req, res) => {
  try {
    const templateResult = await adminSupabase
      .from('meta_templates')
      .select('*')
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.templateId)
      .maybeSingle();

    if (templateResult.error) throw templateResult.error;
    if (!templateResult.data) throw new Error('Template not found.');

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await deleteRemoteTemplate(accessToken, String(row.waba_id), String(templateResult.data.template_name));
    await adminSupabase.from('meta_templates').delete().eq('user_id', req.authedUser!.id).eq('id', req.params.templateId);
    res.status(204).send();
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/flows', async (req, res) => {
  try {
    res.json({
      flows: await syncFlows(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/flows', async (req, res) => {
  try {
    const normalizedInput = normalizeFlowCreateInput(req.body as WhatsAppFlowInput);
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const wabaId = normalizeOptionalIdentifier(row.waba_id);

    if (!wabaId) {
      throw new Error('The connected WhatsApp channel is missing a WABA ID.');
    }

    const remoteFlow = await createRemoteFlow(accessToken, wabaId, normalizedInput);
    const metaFlowId = normalizeOptionalIdentifier(remoteFlow.id);

    if (!metaFlowId) {
      throw new Error('Meta did not return a Flow ID.');
    }

    const flowJson = buildWhatsAppFlowJson(normalizedInput);
    const raw = {
      ...remoteFlow,
      flow_json: flowJson,
      __connektly_versions: getWhatsAppFlowPlatformVersions(),
    };
    const preview = getRemoteFlowPreview(raw);
    const savedAt = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_flows')
      .upsert(
        {
          user_id: req.authedUser!.id,
          meta_channel_id: normalizeOptionalIdentifier(row.id),
          meta_flow_id: metaFlowId,
          flow_name: normalizedInput.name,
          status:
            normalizeOptionalString(remoteFlow.status)?.toUpperCase() ||
            (normalizedInput.publish ? 'PUBLISHED' : 'DRAFT'),
          categories: normalizedInput.categories,
          field_schema: normalizedInput.schema,
          raw,
          preview_url: preview.previewUrl,
          preview_expires_at: preview.previewExpiresAt,
          last_synced_at: savedAt,
          last_error: getFlowValidationMessage(raw),
          updated_at: savedAt,
        },
        {
          onConflict: 'user_id,meta_flow_id',
        },
      )
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      flow: mapFlow(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/meta/flows/:flowId', async (req, res) => {
  try {
    const currentRow = await getStoredFlowRow(req.authedUser!.id, req.params.flowId);
    const currentFlow = mapFlow(currentRow);
    const metaFlowId = currentFlow.metaFlowId;

    if (!metaFlowId) {
      throw new Error('This Flow is missing its Meta Flow ID.');
    }

    const normalizedInput = normalizeFlowUpdateInput(req.body as WhatsAppFlowUpdateInput);

    if (currentFlow.status === 'PUBLISHED' && normalizedInput.schema) {
      throw new Error('Published Flows are immutable. Clone or create a new draft to change fields.');
    }

    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const remoteUpdates: Record<string, unknown> = {};
    const nextName = normalizedInput.name || currentFlow.name;
    const nextCategories = normalizedInput.categories || currentFlow.categories;
    const nextSchema = normalizedInput.schema || currentFlow.schema;

    if (normalizedInput.name || normalizedInput.categories) {
      Object.assign(
        remoteUpdates,
        await updateRemoteFlowMetadata(accessToken, metaFlowId, {
          name: normalizedInput.name,
          categories: normalizedInput.categories,
        }),
      );
    }

    if (normalizedInput.schema) {
      const flowJson = buildWhatsAppFlowJson({
        name: nextName,
        schema: nextSchema,
      });
      Object.assign(remoteUpdates, await updateRemoteFlowJson(accessToken, metaFlowId, flowJson));
      remoteUpdates.flow_json = flowJson;
    }

    const raw = {
      ...currentFlow.raw,
      ...remoteUpdates,
      __connektly_versions: getWhatsAppFlowPlatformVersions(),
    };
    const preview = getRemoteFlowPreview(raw);
    const savedAt = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_flows')
      .update({
        flow_name: nextName,
        categories: nextCategories,
        field_schema: nextSchema,
        raw,
        preview_url: preview.previewUrl || currentFlow.previewUrl,
        preview_expires_at: preview.previewExpiresAt || currentFlow.previewExpiresAt,
        last_synced_at: savedAt,
        last_error: getFlowValidationMessage(raw),
        updated_at: savedAt,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.flowId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      flow: mapFlow(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/flows/:flowId/publish', async (req, res) => {
  try {
    const currentRow = await getStoredFlowRow(req.authedUser!.id, req.params.flowId);
    const currentFlow = mapFlow(currentRow);

    if (!currentFlow.metaFlowId) {
      throw new Error('This Flow is missing its Meta Flow ID.');
    }

    if (currentFlow.status !== 'DRAFT') {
      throw new Error('Only draft Flows can be published.');
    }

    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const remoteResult = await publishRemoteFlow(accessToken, currentFlow.metaFlowId);
    const raw = {
      ...currentFlow.raw,
      ...remoteResult,
      __connektly_versions: getWhatsAppFlowPlatformVersions(),
    };
    const savedAt = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_flows')
      .update({
        status: 'PUBLISHED',
        raw,
        last_synced_at: savedAt,
        last_error: getFlowValidationMessage(raw),
        updated_at: savedAt,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.flowId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      flow: mapFlow(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/flows/:flowId/preview', async (req, res) => {
  try {
    const currentRow = await getStoredFlowRow(req.authedUser!.id, req.params.flowId);
    const currentFlow = mapFlow(currentRow);

    if (!currentFlow.metaFlowId) {
      throw new Error('This Flow is missing its Meta Flow ID.');
    }

    const { accessToken } = await getChannelWithToken(req.authedUser!.id);
    const remoteFlow = await fetchRemoteFlowPreview(accessToken, currentFlow.metaFlowId);
    const raw = {
      ...currentFlow.raw,
      ...remoteFlow,
      __connektly_versions: getWhatsAppFlowPlatformVersions(),
    };
    const preview = getRemoteFlowPreview(raw);
    const remoteCategories = getRemoteFlowCategories(remoteFlow);
    const savedAt = new Date().toISOString();
    const { data, error } = await adminSupabase
      .from('meta_flows')
      .update({
        flow_name: normalizeOptionalString(remoteFlow.name) || currentFlow.name,
        status: normalizeOptionalString(remoteFlow.status)?.toUpperCase() || currentFlow.status,
        categories: remoteCategories.length > 0 ? remoteCategories : currentFlow.categories,
        raw,
        preview_url: preview.previewUrl || currentFlow.previewUrl,
        preview_expires_at: preview.previewExpiresAt || currentFlow.previewExpiresAt,
        last_synced_at: savedAt,
        last_error: getFlowValidationMessage(raw),
        updated_at: savedAt,
      })
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.flowId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    res.json({
      flow: mapFlow(data as Record<string, unknown>),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/meta/flows/:flowId', async (req, res) => {
  try {
    const currentRow = await getStoredFlowRow(req.authedUser!.id, req.params.flowId);
    const currentFlow = mapFlow(currentRow);

    if (currentFlow.status !== 'DRAFT') {
      throw new Error('Only draft Flows can be deleted. Published Flows must be deprecated in Meta.');
    }

    if (currentFlow.metaFlowId) {
      const { accessToken } = await getChannelWithToken(req.authedUser!.id);
      await deleteRemoteFlow(accessToken, currentFlow.metaFlowId);
    }

    const { error } = await adminSupabase
      .from('meta_flows')
      .delete()
      .eq('user_id', req.authedUser!.id)
      .eq('id', req.params.flowId);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/conversational-automation', async (req, res) => {
  try {
    const { row } = await getChannelWithToken(req.authedUser!.id);

    res.json({
      config: await getConversationalAutomationConfig(req.authedUser!.id, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/conversational-automation', async (req, res) => {
  try {
    const normalizedInput = normalizeConversationalAutomationInput(
      req.body as WhatsAppConversationalAutomationUpdateInput,
    );
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);

    try {
      await configureConversationalAutomation(accessToken, String(row.phone_number_id), normalizedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply automation to WhatsApp.';

      await saveConversationalAutomationConfig({
        userId: req.authedUser!.id,
        channelRow: row,
        input: normalizedInput,
        lastError: message,
      });

      throw error;
    }

    const config = await saveConversationalAutomationConfig({
      userId: req.authedUser!.id,
      channelRow: row,
      input: normalizedInput,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });

    res.json({ config });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/automations/rules', async (req, res) => {
  try {
    res.json({
      rules: await getAutomationRules(req.authedUser!.id),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/automations/rules', async (req, res) => {
  try {
    const { row } = await getChannelWithToken(req.authedUser!.id);
    const rules = normalizeAutomationRulesInput((req.body as { rules?: unknown }).rules);

    res.json({
      rules: await saveAutomationRules({
        userId: req.authedUser!.id,
        channelRow: row,
        rules,
      }),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/business-profile', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const [snapshot, remoteProfile] = await Promise.all([
      refreshChannelSnapshot(req.authedUser!.id, row, accessToken),
      fetchBusinessProfile(accessToken, String(row.phone_number_id)),
    ]);
    let profileChannelRow = snapshot.channelRow;
    let profilePhone = snapshot.phone;
    const currentMetadata = isRecord(snapshot.channelRow.metadata)
      ? { ...(snapshot.channelRow.metadata as Record<string, unknown>) }
      : {};
    const currentDisplayNameApproval = isRecord(currentMetadata.displayNameApproval)
      ? { ...(currentMetadata.displayNameApproval as Record<string, unknown>) }
      : {};
    const currentDisplayNameRequest = isRecord(currentMetadata.displayNameRequest)
      ? { ...(currentMetadata.displayNameRequest as Record<string, unknown>) }
      : null;
    const previousDisplayNameStatus =
      getDisplayNameStatus(currentDisplayNameApproval.status) ||
      getStoredDisplayNameApprovalStatus(row.metadata);
    const nextDisplayNameStatus = getDisplayNameStatus(snapshot.phone.name_status);

    if (nextDisplayNameStatus) {
      const approvedAt =
        nextDisplayNameStatus === 'APPROVED'
          ? normalizeOptionalString(currentDisplayNameApproval.approvedAt) ||
            new Date().toISOString()
          : null;
      const nextMetadata = {
        ...currentMetadata,
        displayNameApproval: {
          ...currentDisplayNameApproval,
          status: nextDisplayNameStatus,
          approvedAt,
          lastCheckedAt: new Date().toISOString(),
        },
        ...(currentDisplayNameRequest
          ? {
              displayNameRequest: {
                ...currentDisplayNameRequest,
                status: nextDisplayNameStatus,
                approvedAt:
                  nextDisplayNameStatus === 'APPROVED'
                    ? normalizeOptionalString(currentDisplayNameRequest.approvedAt) ||
                      new Date().toISOString()
                    : normalizeOptionalString(currentDisplayNameRequest.approvedAt),
                lastCheckedAt: new Date().toISOString(),
              },
            }
          : {}),
      };

      const { data: updatedChannelRow, error: updateDisplayNameMetadataError } = await adminSupabase
        .from('meta_channels')
        .update({
          metadata: nextMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', req.authedUser!.id)
        .eq('id', snapshot.channelRow.id)
        .select('*')
        .single();

      if (updateDisplayNameMetadataError) {
        throw updateDisplayNameMetadataError;
      }

      profileChannelRow = updatedChannelRow as Record<string, unknown>;

      if (previousDisplayNameStatus !== 'APPROVED' && nextDisplayNameStatus === 'APPROVED') {
        const verifiedName =
          normalizeOptionalString(snapshot.phone.verified_name) ||
          normalizeOptionalString(snapshot.channelRow.verified_name) ||
          'Your WhatsApp display name';
        const displayPhoneNumber =
          normalizeOptionalString(snapshot.phone.display_phone_number) ||
          normalizeOptionalString(snapshot.channelRow.display_phone_number) ||
          'your connected sender';

        await createUserNotification({
          userId: req.authedUser!.id,
          type: 'display_name_approved',
          title: 'WhatsApp display name approved',
          body: `${verifiedName} is now approved for ${displayPhoneNumber}.`,
          targetPath: '/dashboard/profile',
          metadata: {
            phoneNumberId: String(snapshot.channelRow.phone_number_id),
            verifiedName,
            displayPhoneNumber,
            status: nextDisplayNameStatus,
          },
          dedupeKey: `display-name-approved:${String(snapshot.channelRow.phone_number_id)}:${verifiedName}`,
        });
      }
    }

    const registration = await maybeAutoRegisterApprovedDisplayName({
      userId: req.authedUser!.id,
      row: profileChannelRow,
      accessToken,
      phone: profilePhone,
    });
    profileChannelRow = registration.row;
    profilePhone = registration.phone;

    const officialBusinessAccountStatus = await getOfficialBusinessAccountStatusForChannel({
      userId: req.authedUser!.id,
      row: profileChannelRow,
      accessToken,
    });

    res.json({
      profile: mapBusinessProfile(
        remoteProfile,
        profileChannelRow,
        profilePhone,
        officialBusinessAccountStatus,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/official-business-account', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const status = await getOfficialBusinessAccountStatusForChannel({
      userId: req.authedUser!.id,
      row,
      accessToken,
      force: req.query.force === 'true',
    });

    res.json({ status });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/official-business-account', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const response = await submitOfficialBusinessAccountUpdateForChannel({
      userId: req.authedUser!.id,
      row,
      accessToken,
      input: req.body as WhatsAppOfficialBusinessAccountUpdateInput,
    });

    res.json(response);
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/display-name', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const updatedRow = await updateWhatsAppDisplayNameForChannel({
      userId: req.authedUser!.id,
      row,
      accessToken,
      input: req.body as WhatsAppDisplayNameUpdateInput,
    });
    const [snapshot, remoteProfile] = await Promise.all([
      refreshChannelSnapshot(req.authedUser!.id, updatedRow, accessToken),
      fetchBusinessProfile(accessToken, String(updatedRow.phone_number_id)),
    ]);
    const registration = await maybeAutoRegisterApprovedDisplayName({
      userId: req.authedUser!.id,
      row: snapshot.channelRow,
      accessToken,
      phone: snapshot.phone,
    });
    const officialBusinessAccountStatus = await getOfficialBusinessAccountStatusForChannel({
      userId: req.authedUser!.id,
      row: registration.row,
      accessToken,
    });

    res.json({
      profile: mapBusinessProfile(
        remoteProfile,
        registration.row,
        registration.phone,
        officialBusinessAccountStatus,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/commerce-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const settings = await fetchCommerceSettings(accessToken, String(row.phone_number_id));

    res.json({
      settings: mapCommerceSettings(settings, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/catalog/setup', async (req, res) => {
  try {
    const row = await getMetaChannelRow(req.authedUser!.id);
    res.json(buildMetaCatalogWebhookSetupResponse(req, row));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/catalogs', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await listMetaCatalogsForChannel(row, resolveMetaCatalogAccessToken(row, accessToken)));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/catalog/connect', async (req, res) => {
  try {
    const { code, redirectUri, flowState, oauthState } =
      req.body as MetaCatalogConnectionInput;
    const normalizedCode = normalizeOptionalString(code);
    const normalizedRedirectUri = normalizeOptionalString(redirectUri);
    const normalizedFlowState = normalizeMetaOAuthFlowState(flowState) || 'catalog_flow';

    if (!normalizedCode || !normalizedRedirectUri) {
      throw new Error('code and redirectUri are required.');
    }

    assertMetaOAuthFlowState(normalizedFlowState, 'catalog_flow');

    const { row } = await getChannelWithToken(req.authedUser!.id);
    const catalogAccessToken = await exchangeEmbeddedSignupCode(normalizedCode, {
      redirectUri: normalizedRedirectUri,
      requestReferer: req.get('referer') || undefined,
      requestOrigin: req.get('origin') || undefined,
    });
    const updatedRow = await saveMetaCatalogConnection({
      userId: req.authedUser!.id,
      row,
      accessToken: catalogAccessToken,
      flowState: normalizedFlowState,
      oauthState: normalizeOptionalString(oauthState),
    });

    res.json(await listMetaCatalogsForChannel(updatedRow, catalogAccessToken));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/catalogs', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const catalogAccessToken = resolveMetaCatalogAccessToken(row, accessToken);
    res.json(
      await createMetaCatalogForChannel({
        userId: req.authedUser!.id,
        row,
        accessToken: catalogAccessToken,
        input: req.body as MetaCatalogCreateInput,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/catalogs/select', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const catalogAccessToken = resolveMetaCatalogAccessToken(row, accessToken);
    res.json(
      await selectMetaCatalogForChannel({
        userId: req.authedUser!.id,
        row,
        accessToken: catalogAccessToken,
        input: req.body as MetaCatalogSelectionInput,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/catalogs/:catalogId/products', async (req, res) => {
  try {
    const catalogId = normalizeOptionalIdentifier(req.params.catalogId);
    if (!catalogId) {
      throw new Error('A catalog ID is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const catalogAccessToken = resolveMetaCatalogAccessToken(row, accessToken);
    res.json(
      await listMetaCatalogProducts({
        row,
        accessToken: catalogAccessToken,
        catalogId,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/catalogs/:catalogId/items-batch', async (req, res) => {
  try {
    const catalogId = normalizeOptionalIdentifier(req.params.catalogId);
    if (!catalogId) {
      throw new Error('A catalog ID is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const catalogAccessToken = resolveMetaCatalogAccessToken(row, accessToken);
    res.json(
      await saveMetaCatalogItemsBatch({
        row,
        accessToken: catalogAccessToken,
        catalogId,
        input: req.body as MetaCatalogItemsBatchInput,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/insights/inbox', async (req, res) => {
  try {
    res.json(
      await getInboxInsights(req.authedUser!.id, {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        channel: req.query.channel,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/commerce-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const settings = await updateCommerceSettings(
      accessToken,
      String(row.phone_number_id),
      req.body as WhatsAppCommerceSettingsUpdateInput,
    );

    res.json({
      settings: mapCommerceSettings(settings, row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/business-profile', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const nextProfile = await updateBusinessProfile(
      accessToken,
      String(row.phone_number_id),
      req.body as WhatsAppBusinessProfileUpdateInput,
    );
    const snapshot = await refreshChannelSnapshot(req.authedUser!.id, row, accessToken);
    const officialBusinessAccountStatus = await getOfficialBusinessAccountStatusForChannel({
      userId: req.authedUser!.id,
      row: snapshot.channelRow,
      accessToken,
    });

    res.json({
      profile: mapBusinessProfile(
        nextProfile,
        snapshot.channelRow,
        snapshot.phone,
        officialBusinessAccountStatus,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/business-profile/photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('A profile photo upload is required.');
    }

    if (!isSupportedBusinessProfilePhotoMimeType(req.file.mimetype)) {
      throw new Error('Profile photo must be a PNG or JPEG image.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const handle = await uploadBusinessProfilePhotoHandle(accessToken, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname || 'business-profile-photo',
    });
    const nextProfile = await updateBusinessProfile(accessToken, String(row.phone_number_id), {
      profilePictureHandle: handle,
    });
    const snapshot = await refreshChannelSnapshot(req.authedUser!.id, row, accessToken);
    const officialBusinessAccountStatus = await getOfficialBusinessAccountStatusForChannel({
      userId: req.authedUser!.id,
      row: snapshot.channelRow,
      accessToken,
    });

    res.json({
      profile: mapBusinessProfile(
        nextProfile,
        snapshot.channelRow,
        snapshot.phone,
        officialBusinessAccountStatus,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await fetchAllBlockedUsers(accessToken, String(row.phone_number_id)));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const users = Array.isArray((req.body as { users?: unknown[] }).users)
      ? ((req.body as { users?: string[] }).users as string[])
      : [];
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await blockUsers(accessToken, String(row.phone_number_id), users));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/whatsapp/blocked-users', async (req, res) => {
  try {
    const users = Array.isArray((req.body as { users?: unknown[] }).users)
      ? ((req.body as { users?: string[] }).users as string[])
      : [];
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await unblockUsers(accessToken, String(row.phone_number_id), users));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/developer/whatsapp-activities', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const wabaId = normalizeOptionalIdentifier(row.waba_id);
    const limit = getFirstQueryValue(req.query.limit);
    const after = getFirstQueryValue(req.query.after);
    const before = getFirstQueryValue(req.query.before);
    const since = getFirstQueryValue(req.query.since);
    const until = getFirstQueryValue(req.query.until);
    const activityType = getFirstQueryValue(req.query.activityType);

    if (!wabaId) {
      throw new Error('A WhatsApp Business Account must be connected before viewing activity logs.');
    }

    res.json(
      await fetchWhatsAppBusinessActivities(accessToken, wabaId, {
        limit:
          typeof limit === 'string' || typeof limit === 'number'
            ? Number(limit)
            : undefined,
        after: typeof after === 'string' ? after : undefined,
        before: typeof before === 'string' ? before : undefined,
        since: typeof since === 'string' ? since : undefined,
        until: typeof until === 'string' ? until : undefined,
        activityType: typeof activityType === 'string' ? activityType.split(',') : undefined,
      }),
    );
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/meta/call-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);

    res.json({
      settings: await fetchCallSettings(accessToken, String(row.phone_number_id), row),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/meta/call-settings', async (req, res) => {
  try {
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);

    res.json({
      settings: await updateCallSettings(
        accessToken,
        String(row.phone_number_id),
        row,
        req.body as WhatsAppCallSettingsUpdateInput,
      ),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/calls/permissions', async (req, res) => {
  try {
    const userWaId = typeof req.query.userWaId === 'string' ? req.query.userWaId : '';

    if (!userWaId.trim()) {
      throw new Error('userWaId is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    res.json(await fetchCallPermissions(accessToken, String(row.phone_number_id), userWaId));
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/calls/permissions/request', async (req, res) => {
  try {
    const payload = req.body as SendCallPermissionRequestInput;
    const userWaId = normalizePhoneLike(payload.userWaId);

    if (!userWaId) {
      throw new Error('A valid WhatsApp user ID is required to request call permission.');
    }

    const existingThread = payload.threadId
      ? await getThreadById(req.authedUser!.id, payload.threadId)
      : null;

    if (existingThread && getConversationThreadMessagingChannel(existingThread) !== 'whatsapp') {
      throw new Error('Call permission requests are available only for WhatsApp conversations.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const messagePayload = buildCallPermissionRequestPayload({
      to: userWaId,
      body: payload.body,
    });
    const remote = await sendRemoteWhatsAppMessage(accessToken, String(row.phone_number_id), messagePayload);
    const descriptor = await describeOutgoingWhatsAppMessage(req.authedUser!.id, messagePayload);
    const createdAt = new Date().toISOString();
    const thread = await upsertThread({
      userId: req.authedUser!.id,
      metaChannelId: String(row.id),
      contactWaId: userWaId,
      contactName: existingThread?.contactName || existingThread?.displayPhone || `+${userWaId}`,
      displayPhone: `+${userWaId}`,
      status: 'Follow up Required',
      lastMessageText: descriptor.body,
      lastMessageAt: createdAt,
      unreadDelta: 0,
    });
    const message = await insertMessage({
      userId: req.authedUser!.id,
      threadId: thread.id,
      waMessageId: remote.messages?.[0]?.id || null,
      direction: 'outbound',
      messageType: descriptor.messageType,
      body: descriptor.body,
      senderName: req.authedUser!.user_metadata?.full_name || null,
      senderWaId: String(row.phone_number_id),
      recipientWaId: userWaId,
      templateName: descriptor.templateName,
      status: 'sent',
      raw: {
        client_temp_id: payload.clientTempId || null,
        to: userWaId,
        recipient_type: messagePayload.recipient_type || 'individual',
        call_permission_request: true,
        ...descriptor.raw,
        remote,
      },
    });

    res.json({ ok: true, thread, message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/calls', async (req, res) => {
  try {
    const payload = req.body as WhatsAppCallManageInput;
    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const response = await manageRemoteCall(accessToken, String(row.phone_number_id), payload);
    const callSession =
      response.callId || payload.callId
        ? await upsertCallSession({
            userId: req.authedUser!.id,
            metaChannelId: String(row.id),
            ...buildCallSessionFromManageAction({
              callId: response.callId || payload.callId || '',
              input: payload,
            }),
          })
        : null;
    const callLog =
      payload.action === 'connect' && payload.to
        ? await insertCallLog({
            userId: req.authedUser!.id,
            callId: response.callId,
            phone: payload.to,
            type: 'outgoing',
          })
        : callSession && isTerminalCallState(callSession.state)
          ? await syncCallLogFromSession(req.authedUser!.id, callSession)
          : null;

    if (callSession && isTerminalCallState(callSession.state)) {
      await upsertCallSummaryMessage({
        userId: req.authedUser!.id,
        metaChannelId: String(row.id),
        session: callSession,
      });
    }

    res.json({
      ...response,
      callLog: callLog || undefined,
      callSession: callSession || undefined,
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const contact = await createContact(req.authedUser!.id, req.body as ContactUpsertInput);
    res.json({ contact });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.patch('/api/contacts/:threadId', async (req, res) => {
  try {
    const contact = await updateContact(req.authedUser!.id, req.params.threadId, req.body as ContactUpdateInput);
    res.json({ contact });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.delete('/api/contacts/:threadId', async (req, res) => {
  try {
    await deleteContact(req.authedUser!.id, req.params.threadId);
    res.status(204).end();
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/conversations', async (req, res) => {
  try {
    const requestedLimit = Number(getFirstQueryValue(req.query.limit) || 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
      : 50;
    const { data, error } = await adminSupabase
      .from('conversation_threads')
      .select('*')
      .eq('user_id', req.authedUser!.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({
      conversations: ((data || []) as Record<string, unknown>[]).map((row) => mapThread(row)),
    });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.get('/api/conversations/:threadId', async (req, res) => {
  try {
    const markRead = req.query.markRead !== 'false';
    res.json(await getThreadMessages(req.authedUser!.id, req.params.threadId, { markRead }));
  } catch (error) {
    sendError(res, 404, error);
  }
});

app.post('/api/conversations/:threadId/messages/text', async (req, res) => {
  try {
    const thread = await getThreadById(req.authedUser!.id, req.params.threadId);
    const payload = req.body as SendTextMessageInput;
    const { body, to, clientTempId } = payload;
    const messageBody = normalizeOptionalString(body);

    if (!messageBody) {
      throw new Error('body is required.');
    }

    const threadChannel = getConversationThreadMessagingChannel(thread);

    await ensureConversationReplyWindowOpen(req.authedUser!.id, thread);

    if (threadChannel === 'messenger') {
      const { row, accessToken } = await getMessengerChannelWithToken(req.authedUser!.id);
      const result = await sendThreadOutgoingMessengerTextMessage({
        user: req.authedUser!,
        channelRow: row,
        accessToken,
        thread,
        body: messageBody,
        clientTempId,
      });

      res.json({ ok: true, thread: result.thread, message: result.message });
      return;
    }

    if (threadChannel === 'instagram') {
      const { row, pageAccessToken, userAccessToken } = await getInstagramChannelWithToken(req.authedUser!.id);
      const result = await sendThreadOutgoingInstagramTextMessage({
        user: req.authedUser!,
        channelRow: row,
        userAccessToken,
        pageAccessToken,
        thread,
        body: messageBody,
        clientTempId,
      });

      res.json({ ok: true, thread: result.thread, message: result.message });
      return;
    }

    if (!to) {
      throw new Error('to is required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: buildOutgoingTextPayload({
        ...payload,
        body: messageBody,
      }),
      clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/:threadId/messages/media', async (req, res) => {
  try {
    const thread = await getThreadById(req.authedUser!.id, req.params.threadId);
    const payload = req.body as SendMediaMessageInput;
    const threadChannel = getConversationThreadMessagingChannel(thread);

    await ensureConversationReplyWindowOpen(req.authedUser!.id, thread);

    if (threadChannel === 'messenger' || threadChannel === 'instagram') {
      throw new Error(
        `${threadChannel === 'messenger' ? 'Messenger' : 'Instagram'} media replies are not wired yet. Send a text reply from Inbox.`,
      );
    }

    if (!payload.to || (!payload.mediaId && !payload.mediaLink) || !payload.mediaType) {
      throw new Error('to, mediaType, and either mediaId or mediaLink are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: buildOutgoingMediaPayload(payload),
      clientTempId: payload.clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/:threadId/messages', async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const thread = await getThreadById(req.authedUser!.id, threadId);
    const { message, clientTempId } = req.body as SendWhatsAppMessageInput;

    if (!message) {
      throw new Error('message is required.');
    }

    const threadChannel = getConversationThreadMessagingChannel(thread);

    if (!(threadChannel === 'whatsapp' && message.type === 'template')) {
      await ensureConversationReplyWindowOpen(req.authedUser!.id, thread);
    }

    if (threadChannel === 'messenger') {
      if (message.type !== 'text') {
        throw new Error('Messenger replies from Inbox currently support text messages only.');
      }

      const messageBody = normalizeOptionalString(message.text.body);
      if (!messageBody) {
        throw new Error('message.text.body is required.');
      }

      const { row, accessToken } = await getMessengerChannelWithToken(req.authedUser!.id);
      const result = await sendThreadOutgoingMessengerTextMessage({
        user: req.authedUser!,
        channelRow: row,
        accessToken,
        thread,
        body: messageBody,
        clientTempId,
      });

      res.json({ ok: true, thread: result.thread, message: result.message });
      return;
    }

    if (threadChannel === 'instagram') {
      if (message.type !== 'text') {
        throw new Error('Instagram replies from Inbox currently support text messages only.');
      }

      const messageBody = normalizeOptionalString(message.text.body);
      if (!messageBody) {
        throw new Error('message.text.body is required.');
      }

      const { row, pageAccessToken, userAccessToken } = await getInstagramChannelWithToken(req.authedUser!.id);
      const result = await sendThreadOutgoingInstagramTextMessage({
        user: req.authedUser!,
        channelRow: row,
        userAccessToken,
        pageAccessToken,
        thread,
        body: messageBody,
        clientTempId,
      });

      res.json({ ok: true, thread: result.thread, message: result.message });
      return;
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const result = await sendThreadOutgoingWhatsAppMessage({
      user: req.authedUser!,
      metaChannelId: String(row.id),
      phoneNumberId: String(row.phone_number_id),
      accessToken,
      thread,
      payload: message,
      clientTempId,
    });

    res.json({ ok: true, thread: result.thread, message: result.message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/start', async (req, res) => {
  try {
    const payload = req.body as SendTemplateMessageInput & {
      contactName?: string;
    };
    const { to, templateName, language, contactName, clientTempId } = payload;

    if (!to || !templateName || !language) {
      throw new Error('to, templateName, and language are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await assertMarketingTemplateSendAllowed({
      userId: req.authedUser!.id,
      to,
      templateName,
      language,
    });
    const messagePayload = await buildOutgoingTemplatePayloadWithStoredDefaults(req.authedUser!.id, payload);
    const remote = await sendRemoteWhatsAppTemplateMessageForStoredCategory({
      userId: req.authedUser!.id,
      accessToken,
      phoneNumberId: String(row.phone_number_id),
      payload: messagePayload,
    });
    const createdAt = new Date().toISOString();
    const descriptor = await describeOutgoingWhatsAppMessage(req.authedUser!.id, messagePayload);
    const thread = await upsertThread({
      userId: req.authedUser!.id,
      metaChannelId: String(row.id),
      contactWaId: to,
      contactName: contactName || to,
      displayPhone: to,
      status: 'Connected',
      lastMessageText: descriptor.body,
      lastMessageAt: createdAt,
      unreadDelta: 0,
    });

    const message = await insertMessage({
      userId: req.authedUser!.id,
      threadId: thread.id,
      waMessageId: remote.messages?.[0]?.id || null,
      direction: 'outbound',
      messageType: descriptor.messageType,
      body: descriptor.body,
      senderName: req.authedUser!.user_metadata?.full_name || null,
      senderWaId: String(row.phone_number_id),
      recipientWaId: to,
      templateName: descriptor.templateName,
      status: getRemoteWhatsAppInitialMessageStatus(remote),
      raw: {
        client_temp_id: clientTempId || null,
        to,
        recipient_type: messagePayload.recipient_type || 'individual',
        ...descriptor.raw,
        remote,
      },
    });

    res.json({ ok: true, threadId: thread.id, thread, message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/conversations/template-message', async (req, res) => {
  try {
    const payload = req.body as SendTemplateMessageInput;
    const { to, templateName, language, clientTempId } = payload;

    if (!to || !templateName || !language) {
      throw new Error('to, templateName, and language are required.');
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    await assertMarketingTemplateSendAllowed({
      userId: req.authedUser!.id,
      to,
      templateName,
      language,
    });
    const messagePayload = await buildOutgoingTemplatePayloadWithStoredDefaults(req.authedUser!.id, payload);
    const remote = await sendRemoteWhatsAppTemplateMessageForStoredCategory({
      userId: req.authedUser!.id,
      accessToken,
      phoneNumberId: String(row.phone_number_id),
      payload: messagePayload,
    });
    const descriptor = await describeOutgoingWhatsAppMessage(req.authedUser!.id, messagePayload);

    const thread = await upsertThread({
      userId: req.authedUser!.id,
      metaChannelId: String(row.id),
      contactWaId: to,
      contactName: to,
      displayPhone: to,
      status: 'Connected',
      lastMessageText: descriptor.body,
      lastMessageAt: new Date().toISOString(),
      unreadDelta: 0,
    });

    const message = await insertMessage({
      userId: req.authedUser!.id,
      threadId: thread.id,
      waMessageId: remote.messages?.[0]?.id || null,
      direction: 'outbound',
      messageType: descriptor.messageType,
      body: descriptor.body,
      senderName: req.authedUser!.user_metadata?.full_name || null,
      senderWaId: String(row.phone_number_id),
      recipientWaId: to,
      templateName: descriptor.templateName,
      status: getRemoteWhatsAppInitialMessageStatus(remote),
      raw: {
        client_temp_id: clientTempId || null,
        to,
        recipient_type: messagePayload.recipient_type || 'individual',
        ...descriptor.raw,
        remote,
      },
    });

    res.json({ ok: true, threadId: thread.id, thread, message });
  } catch (error) {
    sendError(res, 400, error);
  }
});

app.post('/api/campaigns/marketing-message', async (req, res) => {
  try {
    const payload = req.body as LaunchMarketingCampaignInput;
    const campaignName = normalizeEditableString(payload.campaignName);
    const templateName = normalizeEditableString(payload.templateName);
    const language = normalizeEditableString(payload.language);
    const recipients = normalizeMarketingCampaignRecipients(payload.recipients);
    const productPolicy = payload.productPolicy
      ? normalizeMarketingMessageProductPolicy(payload.productPolicy)
      : null;
    const messageActivitySharing =
      typeof payload.messageActivitySharing === 'boolean'
        ? payload.messageActivitySharing
        : undefined;

    if (!campaignName) {
      throw new Error('campaignName is required.');
    }

    if (!templateName || !language) {
      throw new Error('templateName and language are required.');
    }

    if (payload.productPolicy && !productPolicy) {
      throw new Error('productPolicy must be CLOUD_API_FALLBACK or STRICT.');
    }

    const effectiveProductPolicy = productPolicy || 'CLOUD_API_FALLBACK';

    const templateRecord = await getStoredTemplateRecord(
      req.authedUser!.id,
      templateName,
      language,
    );

    if (!templateRecord) {
      throw new Error('The selected WhatsApp template could not be found.');
    }

    if (templateRecord.category !== 'MARKETING') {
      throw new Error(
        'Only approved marketing templates can be used for outbound campaigns.',
      );
    }

    if (templateRecord.status !== 'APPROVED') {
      throw new Error(
        'The selected WhatsApp marketing template must be approved before it can be launched.',
      );
    }

    const { row, accessToken } = await getChannelWithToken(req.authedUser!.id);
    const phoneNumberId = String(row.phone_number_id);
    const metaChannelId = String(row.id);
    const results: MarketingCampaignRecipientResult[] = [];

    for (const recipient of recipients) {
      try {
        const optedOutContact = await findMarketingOptedOutContact({
          userId: req.authedUser!.id,
          to: recipient.to,
          threadId: recipient.threadId,
        });

        if (optedOutContact) {
          const contactLabel =
            normalizeOptionalString(optedOutContact.contact_name) ||
            normalizeOptionalString(optedOutContact.display_phone) ||
            recipient.contactName ||
            recipient.to;
          throw new Error(`${contactLabel} has opted out of WhatsApp marketing campaigns.`);
        }

        const templatePayload: SendTemplateMessageInput = {
          to: recipient.to,
          templateName,
          language,
          components: Array.isArray(payload.components) ? payload.components : undefined,
        };
        const messagePayload = await buildOutgoingTemplatePayloadWithStoredDefaults(
          req.authedUser!.id,
          templatePayload,
        );
        const remote = await sendRemoteWhatsAppMarketingMessage(accessToken, phoneNumberId, messagePayload, {
          productPolicy: effectiveProductPolicy,
          messageActivitySharing,
        });
        const descriptor = await describeOutgoingWhatsAppMessage(
          req.authedUser!.id,
          messagePayload,
        );
        const createdAt = new Date().toISOString();
        const thread = await upsertThread({
          userId: req.authedUser!.id,
          metaChannelId,
          contactWaId: recipient.to,
          contactName: recipient.contactName || recipient.to,
          displayPhone: recipient.to,
          status: 'Connected',
          lastMessageText: descriptor.body,
          lastMessageAt: createdAt,
          unreadDelta: 0,
        });
        const messageId = normalizeOptionalString(remote.messages?.[0]?.id);
        const messageStatus = normalizeMarketingMessageStatus(
          remote.messages?.[0]?.message_status,
        );

        await insertMessage({
          userId: req.authedUser!.id,
          threadId: thread.id,
          waMessageId: messageId,
          direction: 'outbound',
          messageType: descriptor.messageType,
          body: descriptor.body,
          senderName: req.authedUser!.user_metadata?.full_name || null,
          senderWaId: phoneNumberId,
          recipientWaId: recipient.to,
          templateName: descriptor.templateName,
          status: messageStatus || 'accepted',
          raw: {
            to: recipient.to,
            recipient_type: 'individual',
            campaign_name: campaignName,
            delivery_type: 'marketing_campaign',
            marketing_message: {
              product_policy: effectiveProductPolicy,
              message_activity_sharing:
                typeof messageActivitySharing === 'boolean'
                  ? messageActivitySharing
                  : null,
              message_status: messageStatus,
            },
            ...descriptor.raw,
            remote,
          },
        });

        results.push({
          to: recipient.to,
          contactName: recipient.contactName,
          success: true,
          threadId: thread.id,
          messageId,
          messageStatus,
          error: null,
        });
      } catch (error) {
        results.push({
          to: recipient.to,
          contactName: recipient.contactName,
          success: false,
          threadId: recipient.threadId,
          messageId: null,
          messageStatus: null,
          error: mapDbError(error),
        });
      }
    }

    const successResults = results.filter((result) => result.success);
    const heldForQualityAssessmentCount = successResults.filter(
      (result) => result.messageStatus === 'held_for_quality_assessment',
    ).length;
    const pausedCount = successResults.filter(
      (result) => result.messageStatus === 'paused',
    ).length;
    const failedCount = results.length - successResults.length;
    const optedOutCount = results.filter((result) =>
      result.error?.toLowerCase().includes('opted out of whatsapp marketing campaigns'),
    ).length;
    const response: LaunchMarketingCampaignResponse = {
      campaignName,
      templateName,
      audienceCount: recipients.length,
      sentCount:
        successResults.length - heldForQualityAssessmentCount - pausedCount,
      failedCount,
      optedOutCount,
      heldForQualityAssessmentCount,
      pausedCount,
      results,
    };

    if (response.sentCount > 0) {
      void dispatchDeveloperWebhookEvent(req.authedUser!.id, 'campaign.sent', {
        campaign: response,
      }).catch((error) => {
        console.error('Failed to dispatch campaign.sent webhook:', error);
      });

      await createUserNotification({
        userId: req.authedUser!.id,
        type: 'campaign_sent',
        title: 'Campaign submitted to Meta',
        body: `${campaignName} was accepted by Meta for ${response.sentCount} contact${
          response.sentCount === 1 ? '' : 's'
        }.`,
        targetPath: '/dashboard/broadcasts',
        metadata: {
          templateName,
          audienceCount: response.audienceCount,
          sentCount: response.sentCount,
          heldForQualityAssessmentCount: response.heldForQualityAssessmentCount,
          pausedCount: response.pausedCount,
        },
      });
    }

    res.json(response);
  } catch (error) {
    sendError(res, 400, error);
  }
});

if (isProduction) {
  const distPath = path.join(__dirname, 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

app.listen(port, () => {
  console.log(`Connektly API server listening on port ${port}`);
});
