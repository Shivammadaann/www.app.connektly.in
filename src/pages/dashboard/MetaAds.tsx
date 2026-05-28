import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Heart,
  Image,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { appApi } from '../../lib/api';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import facebookIconUrl from '../../assets/Facebook.svg';
import type {
  ConversationThread,
  MetaAdsCreationSetupResponse,
  MetaAdsLeadFormOption,
  MetaAdsMediaAsset,
  MetaAdsPixelOption,
  MetaAdsWhatsAppAccountOption,
} from '../../lib/types';

type AdType = 'ctwa' | 'website' | 'lead_form';
type Objective = 'Traffic' | 'Engagement' | 'Sales' | 'Leads';
type Destination = 'facebook' | 'instagram';
type CreativeType = 'image' | 'video';
type BudgetMode = 'daily' | 'lifetime';
type Gender = 'all' | 'men' | 'women';

interface AdDraft {
  campaignName: string;
  adType: AdType;
  objective: Objective;
  performanceGoal: string;
  destinations: Destination[];
  creativeType: CreativeType;
  mediaName: string;
  mediaUrl: string;
  mediaSource: 'upload' | 'meta' | null;
  mediaError: string | null;
  headline: string;
  primaryText: string;
  callToAction: string;
  websiteUrl: string;
  pixelId: string;
  conversionEvent: string;
  selectedLeadFormId: string;
  ctwaPhoneNumberId: string;
  includedAudiences: string;
  excludedAudiences: string;
  savedAudience: string;
  includeLocations: string;
  excludeLocations: string;
  gender: Gender;
  minAge: number;
  maxAge: number;
  languages: string;
  detailedTargeting: string;
  platforms: string[];
  placements: string[];
  budgetMode: BudgetMode;
  budget: string;
  startDate: string;
  endDate: string;
  prefilledText: string;
  icebreakers: string;
}

interface MediaGalleryAsset {
  id: string;
  name: string;
  type: CreativeType;
  url: string;
  thumbnailUrl: string;
  source: 'upload' | 'meta';
  dimensions: string | null;
  createdTime: string | null;
}

interface ReadinessCheck {
  label: string;
  ready: boolean;
  detail: string;
}

const META_LEAD_FORM_LIBRARY_URL = 'https://www.facebook.com/ads/leadgen/forms';

const AD_TYPE_OPTIONS: Array<{ value: AdType; label: string; description: string }> = [
  {
    value: 'ctwa',
    label: 'Click to WhatsApp',
    description: 'Use a connected WhatsApp destination so the ad opens a business chat.',
  },
  {
    value: 'website',
    label: 'Website',
    description: 'Drive landing page visits or website conversions with tracking attached.',
  },
  {
    value: 'lead_form',
    label: 'Lead form',
    description: 'Use a Page-owned instant form and collect leads inside Meta.',
  },
];

const OBJECTIVES_BY_AD_TYPE: Record<AdType, Objective[]> = {
  ctwa: ['Engagement', 'Leads', 'Sales'],
  website: ['Traffic', 'Sales', 'Leads'],
  lead_form: ['Leads'],
};

const PERFORMANCE_GOALS_BY_AD_TYPE: Record<AdType, Partial<Record<Objective, string[]>>> = {
  ctwa: {
    Engagement: ['Maximize number of conversations'],
    Leads: ['Maximize leads'],
    Sales: ['Maximize conversions'],
  },
  website: {
    Traffic: ['Maximize link clicks', 'Maximize landing page views'],
    Sales: ['Maximize conversions', 'Maximize value of conversions'],
    Leads: ['Maximize leads'],
  },
  lead_form: {
    Leads: ['Maximize leads'],
  },
};

const CALL_TO_ACTIONS_BY_AD_TYPE: Record<AdType, string[]> = {
  ctwa: ['Send message', 'Get quote', 'Book now'],
  website: ['Learn more', 'Shop now', 'Sign up', 'Book now'],
  lead_form: ['Sign up', 'Get quote', 'Apply now', 'Learn more'],
};

const DESTINATION_OPTIONS: Array<{ value: Destination; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

const PLATFORM_OPTIONS = ['Facebook', 'Instagram', 'Messenger', 'Audience Network'];
const PLACEMENT_OPTIONS = ['Feeds', 'Stories and Reels', 'Search results', 'In-stream video', 'Marketplace', 'Right column'];
const SAVED_AUDIENCES = ['No saved audience', 'Warm leads', 'High intent prospects', 'VIP customers'];
const WEBSITE_TRACKING_EVENTS = [
  'ViewContent',
  'Lead',
  'CompleteRegistration',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
  'Contact',
  'Schedule',
  'Subscribe',
];

const PREVIEW_PANEL_TRANSITION = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
  mass: 0.95,
} as const;

const PREVIEW_RAIL_WIDTH_CLASS = 'xl:w-[min(46rem,44vw)] xl:flex-none';

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPerformanceGoalOptions(adType: AdType, objective: Objective) {
  const directOptions = PERFORMANCE_GOALS_BY_AD_TYPE[adType][objective];
  if (directOptions?.length) {
    return directOptions;
  }

  const fallbackObjective = OBJECTIVES_BY_AD_TYPE[adType][0];
  return PERFORMANCE_GOALS_BY_AD_TYPE[adType][fallbackObjective] || [];
}

function getDefaultObjective(adType: AdType) {
  return OBJECTIVES_BY_AD_TYPE[adType][0];
}

function getDefaultPerformanceGoal(adType: AdType, objective: Objective) {
  return getPerformanceGoalOptions(adType, objective)[0] || '';
}

function getDefaultCallToAction(adType: AdType) {
  return CALL_TO_ACTIONS_BY_AD_TYPE[adType][0] || 'Learn more';
}

function createDraft(): AdDraft {
  const adType: AdType = 'ctwa';
  const objective = getDefaultObjective(adType);

  return {
    campaignName: '',
    adType,
    objective,
    performanceGoal: getDefaultPerformanceGoal(adType, objective),
    destinations: ['facebook', 'instagram'],
    creativeType: 'image',
    mediaName: '',
    mediaUrl: '',
    mediaSource: null,
    mediaError: null,
    headline: '',
    primaryText: '',
    callToAction: getDefaultCallToAction(adType),
    websiteUrl: '',
    pixelId: '',
    conversionEvent: 'Lead',
    selectedLeadFormId: '',
    ctwaPhoneNumberId: '',
    includedAudiences: '',
    excludedAudiences: '',
    savedAudience: 'No saved audience',
    includeLocations: 'India',
    excludeLocations: '',
    gender: 'all',
    minAge: 18,
    maxAge: 65,
    languages: 'English',
    detailedTargeting: '',
    platforms: ['Facebook', 'Instagram'],
    placements: ['Feeds', 'Stories and Reels'],
    budgetMode: 'daily',
    budget: '1000',
    startDate: todayDate(),
    endDate: futureDate(7),
    prefilledText: '',
    icebreakers: '',
  };
}

function normalizeDraftForAdType(draft: AdDraft) {
  const objectives = OBJECTIVES_BY_AD_TYPE[draft.adType];
  const objective = objectives.includes(draft.objective) ? draft.objective : objectives[0];
  const performanceGoals = getPerformanceGoalOptions(draft.adType, objective);
  const performanceGoal = performanceGoals.includes(draft.performanceGoal)
    ? draft.performanceGoal
    : performanceGoals[0] || '';
  const callToActions = CALL_TO_ACTIONS_BY_AD_TYPE[draft.adType];
  const callToAction = callToActions.includes(draft.callToAction)
    ? draft.callToAction
    : callToActions[0] || '';

  return {
    ...draft,
    objective,
    performanceGoal,
    callToAction,
  };
}

function getAdTypeLabel(value: AdType) {
  return AD_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Click to WhatsApp';
}

function getConversionLocationLabel(adType: AdType) {
  if (adType === 'ctwa') {
    return 'Messaging apps / WhatsApp';
  }

  if (adType === 'website') {
    return 'Website';
  }

  return 'Instant form';
}

function isWebsitePixelRequired(draft: AdDraft) {
  return draft.adType === 'website' && draft.objective !== 'Traffic';
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getEstimatedAudienceSize(draft: AdDraft, leads: ConversationThread[]) {
  let base = 1_200_000;

  if (draft.includeLocations.trim()) base *= 0.58;
  if (draft.excludeLocations.trim()) base *= 0.92;
  if (draft.gender !== 'all') base *= 0.5;
  if (draft.savedAudience !== 'No saved audience') base *= 0.38;
  if (draft.includedAudiences.trim()) base *= 0.52;
  if (draft.excludedAudiences.trim()) base *= 0.86;
  if (draft.detailedTargeting.trim()) base *= 0.64;
  if (draft.languages.trim()) base *= 0.82;

  const ageSpan = Math.max(1, draft.maxAge - draft.minAge);
  base *= Math.min(1, Math.max(0.18, ageSpan / 47));
  base += Math.min(250_000, leads.length * 850);

  const low = Math.max(1_000, Math.round((base * 0.78) / 1000) * 1000);
  const high = Math.max(low + 1000, Math.round((base * 1.24) / 1000) * 1000);

  return { low, high };
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatMediaDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function handleToggle(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function handleDestinationToggle(current: Destination[], value: Destination) {
  if (current.includes(value)) {
    return current.length > 1 ? current.filter((item) => item !== value) : current;
  }

  return [...current, value];
}

function getFileCreativeType(file: File): CreativeType | null {
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    return 'image';
  }

  if (file.type.startsWith('video/') || file.type === 'image/gif') {
    return 'video';
  }

  return null;
}

function validateMedia(file: File, creativeType: CreativeType) {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const videoTypes = ['video/mp4', 'video/quicktime', 'image/gif'];
  const maxSize = creativeType === 'image' ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
  const validType = creativeType === 'image' ? imageTypes.includes(file.type) : videoTypes.includes(file.type);

  if (!validType) {
    return creativeType === 'image' ? 'Use a JPEG, PNG, or WEBP image.' : 'Use an MP4, MOV, or GIF video.';
  }

  if (file.size > maxSize) {
    return creativeType === 'image' ? 'Image ads can be up to 5 MB.' : 'Video ads can be up to 16 MB.';
  }

  return null;
}

function mapMetaMediaAsset(asset: MetaAdsMediaAsset): MediaGalleryAsset | null {
  const url = asset.url || asset.thumbnailUrl;
  const thumbnailUrl = asset.thumbnailUrl || asset.url;

  if (!url || !thumbnailUrl) {
    return null;
  }

  return {
    id: `meta:${asset.id}`,
    name: asset.name || asset.hash || 'Meta ad image',
    type: 'image',
    url,
    thumbnailUrl,
    source: 'meta',
    dimensions: asset.width && asset.height ? `${asset.width} x ${asset.height}` : null,
    createdTime: asset.createdTime,
  };
}

function getAdAccountLabel(adAccount: MetaAdsCreationSetupResponse['adAccounts'][number] | null) {
  if (!adAccount) {
    return 'Not connected';
  }

  const accountNumber = adAccount.accountId || adAccount.adAccountId.replace(/^act_/, '');
  return `${adAccount.name || 'Ad account'}${accountNumber ? ` (${accountNumber})` : ''}`;
}

function getSelectedPageName(setup: MetaAdsCreationSetupResponse | null, bootstrapPageName: string | null) {
  return setup?.config?.pageName || setup?.pages[0]?.pageName || bootstrapPageName || 'Your Page';
}

function getSelectedLeadFormSummary(form: MetaAdsLeadFormOption | null) {
  if (!form) {
    return 'Choose a lead form from the connected Facebook Page.';
  }

  const questionSummary = form.questions.length ? `${form.questions.length} mapped question${form.questions.length > 1 ? 's' : ''}` : 'Question set not returned';
  return `${form.name || 'Untitled form'} - ${questionSummary}`;
}

function getSelectedWhatsAppSummary(account: MetaAdsWhatsAppAccountOption | null) {
  if (!account) {
    return 'Connect a WhatsApp business account to use Click to WhatsApp.';
  }

  return `${account.businessAccountName || account.verifiedName || 'WhatsApp business'}${account.displayPhoneNumber ? ` - ${account.displayPhoneNumber}` : ''}`;
}

function getSelectedPixelSummary(pixel: MetaAdsPixelOption | null) {
  if (!pixel) {
    return 'Select the Pixel attached to the connected ad account.';
  }

  return `${pixel.name || 'Meta Pixel'}${pixel.lastFiredTime ? ` - last fired ${formatMediaDate(pixel.lastFiredTime)}` : ''}`;
}

function getValidationMessages(args: {
  draft: AdDraft;
  setupReady: boolean;
  leadForms: MetaAdsLeadFormOption[];
  pixels: MetaAdsPixelOption[];
  whatsAppAccounts: MetaAdsWhatsAppAccountOption[];
}) {
  const { draft, setupReady, leadForms, pixels, whatsAppAccounts } = args;
  const errors: string[] = [];

  if (!draft.campaignName.trim()) {
    errors.push('Add a campaign name before saving.');
  }

  if (!setupReady) {
    errors.push('Connect a Facebook Page and ad account from Connections before building this ad.');
  }

  if (!draft.mediaUrl) {
    errors.push('Select creative media before publishing.');
  }

  if (!draft.headline.trim()) {
    errors.push('Add a headline for the ad creative.');
  }

  if (!draft.primaryText.trim()) {
    errors.push('Add primary text for the ad creative.');
  }

  if (!draft.budget.trim() || Number(draft.budget) <= 0) {
    errors.push('Enter a valid budget amount.');
  }

  if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) {
    errors.push('Choose a valid start and end date.');
  }

  if (draft.adType === 'ctwa') {
    if (!whatsAppAccounts.length) {
      errors.push('Connect at least one WhatsApp business account before using Click to WhatsApp.');
    } else if (!draft.ctwaPhoneNumberId) {
      errors.push('Select the WhatsApp destination that should receive conversations.');
    }
  }

  if (draft.adType === 'lead_form') {
    if (!leadForms.length) {
      errors.push('No lead forms were returned for the connected Facebook Page.');
    } else if (!draft.selectedLeadFormId) {
      errors.push('Select the instant form that should be attached to this lead ad.');
    }
  }

  if (draft.adType === 'website') {
    if (!draft.websiteUrl.trim()) {
      errors.push('Add the website URL for this ad.');
    } else if (!isValidHttpUrl(draft.websiteUrl.trim())) {
      errors.push('Use a valid website URL starting with http:// or https://.');
    }

    if (isWebsitePixelRequired(draft)) {
      if (!pixels.length) {
        errors.push('No Pixels were returned for the connected ad account.');
      } else if (!draft.pixelId) {
        errors.push('Select the Pixel that will be used for website optimization.');
      }

      if (!draft.conversionEvent) {
        errors.push('Select the website conversion event to optimize for.');
      }
    }
  }

  return errors;
}

function buildReadinessChecks(args: {
  draft: AdDraft;
  setup: MetaAdsCreationSetupResponse | null;
  selectedLeadForm: MetaAdsLeadFormOption | null;
  selectedPixel: MetaAdsPixelOption | null;
  selectedWhatsAppAccount: MetaAdsWhatsAppAccountOption | null;
}) {
  const { draft, setup, selectedLeadForm, selectedPixel, selectedWhatsAppAccount } = args;
  const checks: ReadinessCheck[] = [
    {
      label: 'Page identity',
      ready: Boolean(setup?.config?.pageId),
      detail: setup?.config?.pageName || setup?.config?.pageId || 'Connect a Facebook Page from Connections.',
    },
    {
      label: 'Ad account',
      ready: Boolean(setup?.config?.adAccountId),
      detail: setup?.config?.adAccountName || setup?.config?.adAccountId || 'Connect an Ads Manager account.',
    },
    {
      label: 'Creative',
      ready: Boolean(draft.mediaUrl && draft.headline.trim() && draft.primaryText.trim()),
      detail: draft.mediaName ? `${draft.mediaName} selected` : 'Headline, primary text, and media are required.',
    },
  ];

  if (draft.adType === 'ctwa') {
    checks.push({
      label: 'WhatsApp destination',
      ready: Boolean(selectedWhatsAppAccount),
      detail: getSelectedWhatsAppSummary(selectedWhatsAppAccount),
    });
  }

  if (draft.adType === 'lead_form') {
    checks.push({
      label: 'Instant form',
      ready: Boolean(selectedLeadForm),
      detail: getSelectedLeadFormSummary(selectedLeadForm),
    });
  }

  if (draft.adType === 'website') {
    const trackingRequired = isWebsitePixelRequired(draft);
    checks.push({
      label: 'Website URL',
      ready: Boolean(draft.websiteUrl.trim() && isValidHttpUrl(draft.websiteUrl.trim())),
      detail: draft.websiteUrl.trim() || 'Add the landing page URL.',
    });
    checks.push({
      label: 'Pixel and event',
      ready: trackingRequired ? Boolean(selectedPixel && draft.conversionEvent) : Boolean(draft.websiteUrl.trim()),
      detail: trackingRequired
        ? `${getSelectedPixelSummary(selectedPixel)}${draft.conversionEvent ? ` - ${draft.conversionEvent}` : ''}`
        : 'Traffic objective selected; Pixel is optional but recommended.',
    });
  }

  checks.push({
    label: 'Budget and schedule',
    ready: Boolean(draft.budget.trim() && Number(draft.budget) > 0 && draft.startDate && draft.endDate && draft.endDate >= draft.startDate),
    detail: draft.budget.trim() ? `${draft.budgetMode} budget set from ${draft.startDate} to ${draft.endDate}` : 'Budget and date range are required.',
  });

  return checks;
}

function SectionShell({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1381FF]/10 text-sm font-bold text-[#1381FF]">
          {number}
        </span>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function AssetStatusCard({
  label,
  value,
  help,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  help: string;
  tone?: 'neutral' | 'ready' | 'warning';
}) {
  const toneClassName =
    tone === 'ready'
      ? 'border-emerald-100 bg-emerald-50'
      : tone === 'warning'
        ? 'border-amber-100 bg-amber-50'
        : 'border-gray-200 bg-white';

  const icon =
    tone === 'ready' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : tone === 'warning' ? (
      <AlertTriangle className="h-4 w-4 text-amber-600" />
    ) : (
      <Sparkles className="h-4 w-4 text-[#1381FF]" />
    );

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClassName}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
          <p className="mt-1 text-xs leading-5 text-gray-600">{help}</p>
        </div>
      </div>
    </div>
  );
}

function textInputClass() {
  return 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]';
}

function MediaPreview({ draft, className = '' }: { draft: AdDraft; className?: string }) {
  if (draft.mediaUrl && draft.creativeType === 'image') {
    return <img src={draft.mediaUrl} alt="" className={`h-full w-full object-cover ${className}`} />;
  }

  if (draft.mediaUrl && draft.creativeType === 'video') {
    return <video src={draft.mediaUrl} className={`h-full w-full object-cover ${className}`} muted playsInline controls />;
  }

  return (
    <div className={`flex h-full w-full items-center justify-center bg-gray-100 ${className}`}>
      <div className="px-6 text-center">
        <Upload className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">Choose creative media</p>
      </div>
    </div>
  );
}

function FacebookAdPreview({ draft, pageName }: { draft: AdDraft; pageName: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <img src={facebookIconUrl} alt="" className="h-8 w-8 shrink-0 object-contain" draggable={false} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{pageName}</p>
            <p className="text-xs text-gray-500">Ad - Sponsored</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <MoreHorizontal className="h-4 w-4" />
          <X className="h-4 w-4" />
        </div>
      </div>

      <p className="px-3 pb-3 text-sm leading-5 text-gray-800">
        {draft.primaryText || 'Build the ad structure with the same dependencies Meta expects before publishing.'}
        <span className="text-gray-500"> ...see more</span>
      </p>

      <div className="aspect-square overflow-hidden bg-gray-100">
        <MediaPreview draft={draft} />
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-3 py-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-bold leading-5 text-gray-900">
            {draft.headline || 'Add the Page, destination asset, creative, and budget to continue.'}
          </p>
          {draft.adType === 'website' && draft.websiteUrl ? (
            <p className="mt-1 truncate text-xs text-gray-500">{draft.websiteUrl}</p>
          ) : null}
        </div>
        <button type="button" className="shrink-0 rounded-md bg-gray-200 px-3 py-2 text-sm font-bold text-gray-800">
          {draft.callToAction}
        </button>
      </div>

      <div className="grid grid-cols-2 border-t border-gray-100 px-3 py-2 text-sm font-medium text-gray-500">
        <span className="text-center">Like</span>
        <span className="text-center">Comment</span>
      </div>
    </div>
  );
}

function InstagramAdPreview({ draft, pageName }: { draft: AdDraft; pageName: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChannelBrandIcon channel="instagram" className="h-8 w-8 shrink-0" alt="" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{pageName.toLowerCase().replace(/\s+/g, '.')}</p>
            <p className="text-xs text-gray-500">Ad</p>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 text-gray-700" />
      </div>

      <div className="aspect-square overflow-hidden bg-gray-100">
        <MediaPreview draft={draft} />
      </div>

      <div className="flex items-center justify-between px-3 py-3 text-gray-900">
        <div className="flex items-center gap-3">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>

      <p className="px-3 pb-3 text-sm leading-5 text-gray-800">
        <span className="font-semibold">{pageName.toLowerCase().replace(/\s+/g, '.')}</span>{' '}
        {draft.primaryText || 'Use the asset checklist to mirror Meta Ads Manager before you ship the campaign.'}
        <span className="text-gray-500"> ...more</span>
      </p>
    </div>
  );
}

function AdPreview({
  draft,
  pageName,
  readinessChecks,
  onToggleVisibility,
}: {
  draft: AdDraft;
  pageName: string;
  readinessChecks: ReadinessCheck[];
  onToggleVisibility: () => void;
}) {
  const destinations = draft.destinations.length ? draft.destinations : ['facebook'];

  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="space-y-5">
        <div className="max-h-none rounded-3xl border border-gray-200 bg-white p-5 shadow-sm xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Ad Preview</p>
              <p className="text-xs text-gray-500">
                {destinations.length === 2
                  ? 'Facebook and Instagram preview'
                  : `${destinations[0] === 'instagram' ? 'Instagram' : 'Facebook'} preview`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {getAdTypeLabel(draft.adType)}
              </span>
              <button
                type="button"
                onClick={onToggleVisibility}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Hide
              </button>
            </div>
          </div>

          <div className={`grid gap-4 ${destinations.length > 1 ? 'md:grid-cols-2 xl:grid-cols-2' : ''}`}>
            {destinations.includes('facebook') ? <FacebookAdPreview draft={draft} pageName={pageName} /> : null}
            {destinations.includes('instagram') ? <InstagramAdPreview draft={draft} pageName={pageName} /> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Meta readiness</p>
              <p className="text-xs text-gray-500">Required assets for the selected ad path.</p>
            </div>
            <span className="rounded-full bg-[#1381FF]/10 px-3 py-1 text-xs font-semibold text-[#1381FF]">
              {readinessChecks.filter((item) => item.ready).length}/{readinessChecks.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {readinessChecks.map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">{item.detail}</p>
                  </div>
                  {item.ready ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function MediaGalleryModal({
  localAssets,
  metaAssets,
  isLoading,
  error,
  onClose,
  onRefresh,
  onUpload,
  onSelect,
}: {
  localAssets: MediaGalleryAsset[];
  metaAssets: MediaGalleryAsset[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onUpload: (files: FileList | null) => void;
  onSelect: (asset: MediaGalleryAsset) => void;
}) {
  const assets = [...localAssets, ...metaAssets];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Meta Ads</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Media Gallery</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose uploaded media or select an image fetched from the connected ad account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close media gallery"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-104px)] overflow-y-auto px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#1381FF] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8]">
                <Plus className="h-4 w-4" />
                Upload Media
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,image/gif"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    onUpload(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh Meta Media
              </button>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
              {assets.length} media files
            </span>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          ) : null}

          {isLoading && !assets.length ? (
            <div className="mt-6 flex min-h-[280px] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
              <Loader2 className="h-7 w-7 animate-spin text-[#1381FF]" />
            </div>
          ) : assets.length ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset)}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#1381FF] hover:shadow-md"
                >
                  <div className="aspect-square bg-gray-100">
                    {asset.type === 'image' ? (
                      <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={asset.thumbnailUrl} className="h-full w-full object-cover" muted playsInline />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-gray-900">{asset.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {asset.source === 'meta' ? 'Meta media' : 'Uploaded'}
                      {asset.dimensions ? ` - ${asset.dimensions}` : ''}
                    </p>
                    {formatMediaDate(asset.createdTime) ? (
                      <p className="mt-1 text-xs text-gray-400">{formatMediaDate(asset.createdTime)}</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
              <Image className="h-10 w-10 text-gray-300" />
              <p className="mt-4 text-sm font-semibold text-gray-900">No media found</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                Upload a creative here, or refresh after adding media to your connected Meta ad account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MetaAds() {
  const { bootstrap } = useAppData();
  const shouldReduceMotion = useReducedMotion();
  const [draft, setDraft] = useState<AdDraft>(() => createDraft());
  const [setup, setSetup] = useState<MetaAdsCreationSetupResponse | null>(null);
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isPlacementPreviewVisible, setIsPlacementPreviewVisible] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
  const [localMediaAssets, setLocalMediaAssets] = useState<MediaGalleryAsset[]>([]);
  const [metaMediaAssets, setMetaMediaAssets] = useState<MediaGalleryAsset[]>([]);
  const [isMediaLibraryLoading, setIsMediaLibraryLoading] = useState(false);
  const [mediaLibraryError, setMediaLibraryError] = useState<string | null>(null);
  const hasLoadedMediaLibraryRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);

  const objectiveOptions = useMemo(
    () => OBJECTIVES_BY_AD_TYPE[draft.adType].map((objective) => ({ value: objective, label: objective })),
    [draft.adType],
  );
  const performanceGoalOptions = useMemo(
    () =>
      getPerformanceGoalOptions(draft.adType, draft.objective).map((goal) => ({
        value: goal,
        label: goal,
      })),
    [draft.adType, draft.objective],
  );
  const callToActionOptions = useMemo(
    () =>
      CALL_TO_ACTIONS_BY_AD_TYPE[draft.adType].map((cta) => ({
        value: cta,
        label: cta,
      })),
    [draft.adType],
  );
  const audience = useMemo(
    () => getEstimatedAudienceSize(draft, bootstrap?.conversations || []),
    [draft, bootstrap?.conversations],
  );
  const setupReady = Boolean(setup?.config?.status === 'ready' && setup?.config?.pageId && setup?.config?.adAccountId);
  const selectedLeadForm = useMemo(
    () => setup?.leadForms.find((form) => form.formId === draft.selectedLeadFormId) || null,
    [setup?.leadForms, draft.selectedLeadFormId],
  );
  const selectedPixel = useMemo(
    () => setup?.pixels.find((pixel) => pixel.pixelId === draft.pixelId) || null,
    [setup?.pixels, draft.pixelId],
  );
  const selectedWhatsAppAccount = useMemo(
    () =>
      setup?.whatsAppAccounts.find((account) => account.phoneNumberId === draft.ctwaPhoneNumberId) || null,
    [setup?.whatsAppAccounts, draft.ctwaPhoneNumberId],
  );
  const selectedPageName = useMemo(
    () => getSelectedPageName(setup, bootstrap?.adsIntegration?.pageName || null),
    [setup, bootstrap?.adsIntegration?.pageName],
  );
  const selectedAdAccount = useMemo(
    () =>
      setup?.adAccounts.find((account) => account.adAccountId === setup?.config?.adAccountId) ||
      setup?.adAccounts[0] ||
      null,
    [setup],
  );
  const selectedPage = useMemo(
    () => setup?.pages.find((page) => page.pageId === setup?.config?.pageId) || setup?.pages[0] || null,
    [setup],
  );
  const validationMessages = useMemo(
    () =>
      getValidationMessages({
        draft,
        setupReady,
        leadForms: setup?.leadForms || [],
        pixels: setup?.pixels || [],
        whatsAppAccounts: setup?.whatsAppAccounts || [],
      }),
    [draft, setupReady, setup?.leadForms, setup?.pixels, setup?.whatsAppAccounts],
  );
  const readinessChecks = useMemo(
    () =>
      buildReadinessChecks({
        draft,
        setup,
        selectedLeadForm,
        selectedPixel,
        selectedWhatsAppAccount,
      }),
    [draft, setup, selectedLeadForm, selectedPixel, selectedWhatsAppAccount],
  );
  const budgetCurrency = setup?.config?.currency || bootstrap?.profile?.preferredCurrency || 'INR';

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const loadCreationSetup = async () => {
    try {
      setIsSetupLoading(true);
      setSetupError(null);
      const response = await appApi.getMetaAdsCreationSetup();
      setSetup(response);
      setMetaMediaAssets([]);
      hasLoadedMediaLibraryRef.current = false;
    } catch (nextError) {
      setSetupError(nextError instanceof Error ? nextError.message : 'Failed to load Meta ad creation setup.');
    } finally {
      setIsSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadCreationSetup();
  }, []);

  useEffect(() => {
    if (!setup) {
      return;
    }

    setDraft((current) => {
      const normalized = normalizeDraftForAdType(current);
      const nextLeadFormId = setup.leadForms.some((form) => form.formId === normalized.selectedLeadFormId)
        ? normalized.selectedLeadFormId
        : setup.leadForms[0]?.formId || '';
      const nextPixelId = setup.pixels.some((pixel) => pixel.pixelId === normalized.pixelId)
        ? normalized.pixelId
        : setup.pixels[0]?.pixelId || '';
      const nextPhoneNumberId = setup.whatsAppAccounts.some(
        (account) => account.phoneNumberId === normalized.ctwaPhoneNumberId,
      )
        ? normalized.ctwaPhoneNumberId
        : setup.whatsAppAccounts[0]?.phoneNumberId || '';

      if (
        normalized.objective === current.objective &&
        normalized.performanceGoal === current.performanceGoal &&
        normalized.callToAction === current.callToAction &&
        nextLeadFormId === current.selectedLeadFormId &&
        nextPixelId === current.pixelId &&
        nextPhoneNumberId === current.ctwaPhoneNumberId
      ) {
        return current;
      }

      return {
        ...normalized,
        selectedLeadFormId: nextLeadFormId,
        pixelId: nextPixelId,
        ctwaPhoneNumberId: nextPhoneNumberId,
      };
    });
  }, [setup]);

  const updateDraft = (updates: Partial<AdDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
    setFeedback(null);
  };

  const handleAdTypeChange = (nextType: AdType) => {
    setDraft((current) => normalizeDraftForAdType({ ...current, adType: nextType }));
    setFeedback(null);
  };

  const handleObjectiveChange = (nextObjective: Objective) => {
    setDraft((current) => normalizeDraftForAdType({ ...current, objective: nextObjective }));
    setFeedback(null);
  };

  const loadMetaMediaLibrary = async () => {
    try {
      setIsMediaLibraryLoading(true);
      setMediaLibraryError(null);
      const response = await appApi.getMetaAdsMediaLibrary();
      setMetaMediaAssets(
        response.assets
          .map(mapMetaMediaAsset)
          .filter((asset): asset is MediaGalleryAsset => Boolean(asset)),
      );
      hasLoadedMediaLibraryRef.current = true;
    } catch (nextError) {
      setMediaLibraryError(
        nextError instanceof Error ? nextError.message : 'Unable to fetch media from the connected Meta ad account.',
      );
    } finally {
      setIsMediaLibraryLoading(false);
    }
  };

  const openMediaGallery = () => {
    setIsMediaGalleryOpen(true);

    if (!hasLoadedMediaLibraryRef.current && setupReady) {
      void loadMetaMediaLibrary();
    }
  };

  const selectMediaAsset = (asset: MediaGalleryAsset) => {
    updateDraft({
      creativeType: asset.type,
      mediaName: asset.name,
      mediaUrl: asset.url,
      mediaSource: asset.source,
      mediaError: null,
    });
    setIsMediaGalleryOpen(false);
  };

  const handleMediaUpload = (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);

    if (!selectedFiles.length) {
      return;
    }

    const nextAssets: MediaGalleryAsset[] = [];
    let nextError: string | null = null;

    for (const file of selectedFiles) {
      const fileCreativeType = getFileCreativeType(file);

      if (!fileCreativeType) {
        nextError = 'Use a JPEG, PNG, WEBP, MP4, MOV, or GIF file.';
        continue;
      }

      const mediaError = validateMedia(file, fileCreativeType);

      if (mediaError) {
        nextError = mediaError;
        continue;
      }

      const url = URL.createObjectURL(file);
      objectUrlsRef.current.push(url);
      nextAssets.push({
        id: `upload:${Date.now()}:${file.name}:${nextAssets.length}`,
        name: file.name,
        type: fileCreativeType,
        url,
        thumbnailUrl: url,
        source: 'upload',
        dimensions: null,
        createdTime: new Date().toISOString(),
      });
    }

    if (nextAssets.length) {
      setLocalMediaAssets((current) => [...nextAssets, ...current]);
      selectMediaAsset(nextAssets[0]);
    } else if (nextError) {
      updateDraft({ mediaError: nextError });
    }
  };

  const handleSave = (publish: boolean) => {
    if (publish && validationMessages.length) {
      setFeedback(validationMessages[0]);
      return;
    }

    if (!publish) {
      setFeedback('Draft staged locally with Meta-aligned asset selections.');
      return;
    }

    setFeedback(
      'Publish payload is structurally ready. Wire the Marketing API campaign creation endpoint next to submit it to Meta.',
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Ad</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Build the campaign in the same order Meta expects: objective, conversion location, required asset, creative,
            audience, and budget.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsPlacementPreviewVisible((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            {isPlacementPreviewVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPlacementPreviewVisible ? 'Hide Placement Preview' : 'Show Placement Preview'}
          </button>
          <button
            type="button"
            onClick={() => void loadCreationSetup()}
            disabled={isSetupLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSetupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh Assets
          </button>
          <Link
            to="/dashboard/connections?integration=meta-ads"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Connect Ads Integration <Link2 className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <AssetStatusCard
          label="Facebook Page"
          value={selectedPage?.pageName || selectedPage?.pageId || 'Not connected'}
          help={
            selectedPage
              ? selectedPage.hasPageAccessToken
                ? 'Page access token is available for Page-owned assets.'
                : 'Reconnect if the Page token is missing.'
              : 'Lead forms and ad identity depend on the selected Page.'
          }
          tone={selectedPage ? 'ready' : 'warning'}
        />
        <AssetStatusCard
          label="Ad Account"
          value={getAdAccountLabel(selectedAdAccount)}
          help={selectedAdAccount ? `Billing currency: ${selectedAdAccount.currency || 'Not returned'}` : 'Select the ad account in Connections first.'}
          tone={selectedAdAccount ? 'ready' : 'warning'}
        />
        <AssetStatusCard
          label="Lead Forms"
          value={`${setup?.leadForms.length || 0} form${(setup?.leadForms.length || 0) === 1 ? '' : 's'} detected`}
          help="Lead ads use forms that live on the connected Facebook Page."
          tone={draft.adType === 'lead_form' ? ((setup?.leadForms.length || 0) > 0 ? 'ready' : 'warning') : 'neutral'}
        />
        <AssetStatusCard
          label="WhatsApp"
          value={`${setup?.whatsAppAccounts.length || 0} destination${(setup?.whatsAppAccounts.length || 0) === 1 ? '' : 's'} connected`}
          help="Click to WhatsApp needs a connected WABA destination."
          tone={draft.adType === 'ctwa' ? ((setup?.whatsAppAccounts.length || 0) > 0 ? 'ready' : 'warning') : 'neutral'}
        />
        <AssetStatusCard
          label="Pixel Tracking"
          value={`${setup?.pixels.length || 0} Pixel${(setup?.pixels.length || 0) === 1 ? '' : 's'} returned`}
          help="Website Sales and Leads campaigns need a Pixel plus conversion event."
          tone={draft.adType === 'website' ? ((setup?.pixels.length || 0) > 0 ? 'ready' : 'warning') : 'neutral'}
        />
      </div>

      {setupError ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {setupError}
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{feedback}</div>
      ) : null}

      <motion.div
        layout
        transition={PREVIEW_PANEL_TRANSITION}
        className="flex flex-col gap-6 xl:flex-row xl:items-start"
      >
        <motion.div layout transition={PREVIEW_PANEL_TRANSITION} className="min-w-0 flex-1 space-y-5">
          <AnimatePresence initial={false} mode="popLayout">
            {!isPlacementPreviewVisible ? (
              <motion.div
                key="preview-hidden-callout"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.98 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                transition={PREVIEW_PANEL_TRANSITION}
                className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600"
              >
                Placement preview is hidden. Use{' '}
                <span className="font-semibold text-gray-900">Show Placement Preview</span> anytime to open the Facebook
                and Instagram mockups again.
              </motion.div>
            ) : null}
          </AnimatePresence>

          <SectionShell number="0" title="Campaign Name">
            <FieldLabel label="Campaign Name">
              <input
                value={draft.campaignName}
                onChange={(event) => updateDraft({ campaignName: event.target.value })}
                className={textInputClass()}
                placeholder="Monsoon lead generation campaign"
              />
            </FieldLabel>
          </SectionShell>

          <SectionShell number="1" title="Ad Journey">
            <div className="grid gap-3 md:grid-cols-3">
              {AD_TYPE_OPTIONS.map((option) => {
                const isSelected = draft.adType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleAdTypeChange(option.value)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected ? 'border-[#1381FF] bg-[#1381FF]/5' : 'border-gray-200 bg-gray-50 hover:bg-white'
                    }`}
                  >
                    <p className="text-sm font-bold text-gray-900">{option.label}</p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">{option.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <FieldLabel label="Objective">
                <DropdownSelect
                  value={draft.objective}
                  onChange={(value) => handleObjectiveChange(value as Objective)}
                  options={objectiveOptions}
                  ariaLabel="Select Meta ad objective"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
              <FieldLabel label="Performance Goal">
                <DropdownSelect
                  value={draft.performanceGoal}
                  onChange={(nextGoal) => updateDraft({ performanceGoal: nextGoal })}
                  options={performanceGoalOptions}
                  ariaLabel="Select Meta ad performance goal"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
            </div>

            <div className="mt-4 rounded-2xl border border-[#dcd6ff] bg-[#f7f5ff] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1381FF]">Conversion location</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{getConversionLocationLabel(draft.adType)}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {draft.adType === 'ctwa'
                  ? 'Meta will expect a connected WhatsApp destination for this ad path.'
                  : draft.adType === 'lead_form'
                    ? 'Lead ads attach a Page-owned instant form at the ad level.'
                    : isWebsitePixelRequired(draft)
                      ? 'Website Leads and Sales flows should be paired with a Pixel and optimization event.'
                      : 'Traffic campaigns can send visitors to a website without forcing a conversion event.'}
              </p>
            </div>
          </SectionShell>

          <SectionShell number="2" title="Identity and Destination Asset">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connected Page</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {selectedPage?.pageName || selectedPage?.pageId || 'Not connected'}
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  {selectedPage?.hasPageAccessToken
                    ? 'This Page can be used for Page identity and instant forms.'
                    : 'Reconnect the Page if assets are not loading correctly.'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Connected Ad Account</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{getAdAccountLabel(selectedAdAccount)}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  {selectedAdAccount
                    ? `Account currency: ${selectedAdAccount.currency || 'Not returned'}`
                    : 'Choose the ad account from Connections before publishing.'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">Placements to preview</p>
              <div className="grid gap-3 md:grid-cols-2">
                {DESTINATION_OPTIONS.map((option) => {
                  const isSelected = draft.destinations.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        updateDraft({ destinations: handleDestinationToggle(draft.destinations, option.value) })
                      }
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected ? 'border-[#1381FF] bg-[#1381FF]/5' : 'border-gray-200 bg-gray-50 hover:bg-white'
                      }`}
                    >
                      {option.value === 'instagram' ? (
                        <ChannelBrandIcon channel="instagram" className="h-8 w-8" alt="" />
                      ) : (
                        <img src={facebookIconUrl} alt="" className="h-8 w-8 object-contain" draggable={false} />
                      )}
                      <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.adType === 'ctwa' ? (
              <div className="mt-5 space-y-4">
                <FieldLabel label="Connected WhatsApp destination">
                  <DropdownSelect
                    value={draft.ctwaPhoneNumberId}
                    onChange={(value) => updateDraft({ ctwaPhoneNumberId: value })}
                    options={(setup?.whatsAppAccounts || []).map((account) => ({
                      value: account.phoneNumberId,
                      label: `${account.businessAccountName || account.verifiedName || 'WhatsApp business'}${account.displayPhoneNumber ? ` - ${account.displayPhoneNumber}` : ''}`,
                    }))}
                    placeholder="Select a connected WhatsApp account"
                    disabled={!setup?.whatsAppAccounts.length}
                    ariaLabel="Select connected WhatsApp destination"
                    buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                  />
                </FieldLabel>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Selected destination</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{getSelectedWhatsAppSummary(selectedWhatsAppAccount)}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {selectedWhatsAppAccount?.qualityRating
                      ? `Quality rating: ${selectedWhatsAppAccount.qualityRating}`
                      : 'Connect a WABA from Channels if nothing is listed here.'}
                  </p>
                  {!setup?.whatsAppAccounts.length ? (
                    <Link
                      to="/dashboard/connections?section=channels"
                      className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#1381FF]"
                    >
                      Open Channels <Link2 className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            {draft.adType === 'lead_form' ? (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FieldLabel label="Instant form">
                    <DropdownSelect
                      value={draft.selectedLeadFormId}
                      onChange={(value) => updateDraft({ selectedLeadFormId: value })}
                      options={(setup?.leadForms || []).map((form) => ({
                        value: form.formId,
                        label: form.name || form.formId,
                      }))}
                      placeholder="Select a lead form from the Page"
                      disabled={!setup?.leadForms.length}
                      ariaLabel="Select lead form"
                      buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                    />
                  </FieldLabel>

                  <div className="flex flex-wrap gap-3 pt-7">
                    <button
                      type="button"
                      onClick={() => void loadCreationSetup()}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Refresh Forms
                    </button>
                    <a
                      href={META_LEAD_FORM_LIBRARY_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#1381FF] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8]"
                    >
                      Create Form in Meta <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Selected form</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{getSelectedLeadFormSummary(selectedLeadForm)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedLeadForm?.questions.length ? (
                      selectedLeadForm.questions.map((question) => (
                        <span
                          key={question}
                          className="rounded-full border border-[#d7d2ff] bg-white px-3 py-1 text-xs font-medium text-[#1381FF]"
                        >
                          {question}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">
                        Instant forms are created on the Page in Meta and then attached here.
                      </span>
                    )}
                  </div>
                  {selectedLeadForm?.followUpActionUrl ? (
                    <p className="mt-3 text-xs leading-5 text-gray-500">
                      Follow-up URL: {selectedLeadForm.followUpActionUrl}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {draft.adType === 'website' ? (
              <div className="mt-5 space-y-4">
                <FieldLabel label="Website URL">
                  <input
                    value={draft.websiteUrl}
                    onChange={(event) => updateDraft({ websiteUrl: event.target.value })}
                    className={textInputClass()}
                    placeholder="https://yourcompany.com/landing-page"
                  />
                </FieldLabel>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldLabel label="Pixel">
                    <DropdownSelect
                      value={draft.pixelId}
                      onChange={(value) => updateDraft({ pixelId: value })}
                      options={(setup?.pixels || []).map((pixel) => ({
                        value: pixel.pixelId,
                        label: pixel.name || pixel.pixelId,
                      }))}
                      placeholder="Select Pixel"
                      disabled={!setup?.pixels.length}
                      ariaLabel="Select Meta Pixel"
                      buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                    />
                  </FieldLabel>
                  <FieldLabel label="Website conversion event">
                    <DropdownSelect
                      value={draft.conversionEvent}
                      onChange={(value) => updateDraft({ conversionEvent: value })}
                      options={WEBSITE_TRACKING_EVENTS.map((eventName) => ({
                        value: eventName,
                        label: eventName,
                      }))}
                      placeholder="Select conversion event"
                      disabled={!isWebsitePixelRequired(draft)}
                      ariaLabel="Select conversion event"
                      buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                    />
                  </FieldLabel>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Tracking status</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{getSelectedPixelSummary(selectedPixel)}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {isWebsitePixelRequired(draft)
                      ? 'This objective should be paired with a Pixel and event before campaign creation.'
                      : 'Traffic objective selected. Pixel tracking is optional, but it is still recommended for measurement.'}
                  </p>
                </div>
              </div>
            ) : null}
          </SectionShell>

          <SectionShell number="3" title="Set Ad Creative">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Creative Type">
                <DropdownSelect
                  value={draft.creativeType}
                  onChange={(nextCreativeType) =>
                    updateDraft({
                      creativeType: nextCreativeType as CreativeType,
                      mediaName: '',
                      mediaUrl: '',
                      mediaSource: null,
                      mediaError: null,
                    })
                  }
                  options={[
                    { value: 'image', label: 'Image' },
                    { value: 'video', label: 'Video' },
                  ]}
                  ariaLabel="Select creative type"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">Media</span>
                <button
                  type="button"
                  onClick={openMediaGallery}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-[#1381FF] hover:bg-white"
                >
                  <Image className="h-4 w-4" />
                  Open Media Gallery
                </button>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {draft.creativeType === 'image'
                ? 'JPEG, PNG, or WEBP, up to 5 MB.'
                : 'MP4, MOV, or GIF, up to 16 MB.'}
            </p>
            {draft.mediaError ? <p className="mt-2 text-sm text-rose-600">{draft.mediaError}</p> : null}

            {draft.mediaName ? (
              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {draft.mediaUrl && draft.creativeType === 'image' ? (
                    <img src={draft.mediaUrl} alt="" className="h-full w-full object-cover" />
                  ) : draft.mediaUrl ? (
                    <video src={draft.mediaUrl} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <Sparkles className="h-6 w-6 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{draft.mediaName}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {draft.mediaSource === 'meta' ? 'Meta account media' : 'Uploaded media'} - {draft.creativeType}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft({
                      mediaName: '',
                      mediaUrl: '',
                      mediaSource: null,
                      mediaError: null,
                    })
                  }
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
                  aria-label="Remove selected media"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldLabel label="Headline">
                <input
                  value={draft.headline}
                  onChange={(event) => updateDraft({ headline: event.target.value })}
                  className={textInputClass()}
                  placeholder={draft.adType === 'website' ? 'Discover the full product range' : 'Talk to our team today'}
                />
              </FieldLabel>
              <FieldLabel label="Call to Action">
                <DropdownSelect
                  value={draft.callToAction}
                  onChange={(value) => updateDraft({ callToAction: value })}
                  options={callToActionOptions}
                  ariaLabel="Select call to action"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
            </div>
            <div className="mt-4">
              <FieldLabel label="Primary Text">
                <textarea
                  value={draft.primaryText}
                  onChange={(event) => updateDraft({ primaryText: event.target.value })}
                  rows={4}
                  className={textInputClass()}
                  placeholder="Explain the offer, value proposition, and what the user should do next."
                />
              </FieldLabel>
            </div>
          </SectionShell>

          <SectionShell number="4" title="Audience and Placement Controls">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Use Saved Audience">
                <DropdownSelect
                  value={draft.savedAudience}
                  onChange={(nextAudience) => updateDraft({ savedAudience: nextAudience })}
                  options={SAVED_AUDIENCES.map((audienceName) => ({ value: audienceName, label: audienceName }))}
                  ariaLabel="Select saved audience"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
              <FieldLabel label="Gender">
                <DropdownSelect
                  value={draft.gender}
                  onChange={(nextGender) => updateDraft({ gender: nextGender as Gender })}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'men', label: 'Men' },
                    { value: 'women', label: 'Women' },
                  ]}
                  ariaLabel="Select audience gender"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
              <FieldLabel label="Include Custom or Lookalike Audiences">
                <input
                  value={draft.includedAudiences}
                  onChange={(event) => updateDraft({ includedAudiences: event.target.value })}
                  className={textInputClass()}
                  placeholder="Lead list lookalike, purchasers"
                />
              </FieldLabel>
              <FieldLabel label="Exclude Custom or Lookalike Audiences">
                <input
                  value={draft.excludedAudiences}
                  onChange={(event) => updateDraft({ excludedAudiences: event.target.value })}
                  className={textInputClass()}
                  placeholder="Existing customers"
                />
              </FieldLabel>
              <FieldLabel label="Include Locations">
                <input
                  value={draft.includeLocations}
                  onChange={(event) => updateDraft({ includeLocations: event.target.value })}
                  className={textInputClass()}
                  placeholder="India, Delhi, Mumbai"
                />
              </FieldLabel>
              <FieldLabel label="Exclude Locations">
                <input
                  value={draft.excludeLocations}
                  onChange={(event) => updateDraft({ excludeLocations: event.target.value })}
                  className={textInputClass()}
                  placeholder="Locations to exclude"
                />
              </FieldLabel>
              <FieldLabel label="Languages">
                <input
                  value={draft.languages}
                  onChange={(event) => updateDraft({ languages: event.target.value })}
                  className={textInputClass()}
                  placeholder="English, Hindi"
                />
              </FieldLabel>
              <FieldLabel label="Demographics, Interests, or Behaviors">
                <input
                  value={draft.detailedTargeting}
                  onChange={(event) => updateDraft({ detailedTargeting: event.target.value })}
                  className={textInputClass()}
                  placeholder="Small business owners, online shopping"
                />
              </FieldLabel>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <FieldLabel label="Minimum Age">
                <input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.minAge}
                  onChange={(event) => updateDraft({ minAge: Number(event.target.value) })}
                  className={textInputClass()}
                />
              </FieldLabel>
              <FieldLabel label="Maximum Age">
                <input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.maxAge}
                  onChange={(event) => updateDraft({ maxAge: Number(event.target.value) })}
                  className={textInputClass()}
                />
              </FieldLabel>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Est. audience</p>
                <p className="mt-2 text-xl font-bold text-gray-900">
                  {formatCompactNumber(audience.low)} - {formatCompactNumber(audience.high)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Destination Platforms</p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => updateDraft({ platforms: handleToggle(draft.platforms, platform) })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        draft.platforms.includes(platform)
                          ? 'border-[#1381FF] bg-[#1381FF]/10 text-[#1381FF]'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Placements</p>
                <div className="flex flex-wrap gap-2">
                  {PLACEMENT_OPTIONS.map((placement) => (
                    <button
                      key={placement}
                      type="button"
                      onClick={() => updateDraft({ placements: handleToggle(draft.placements, placement) })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        draft.placements.includes(placement)
                          ? 'border-[#1381FF] bg-[#1381FF]/10 text-[#1381FF]'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {placement}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionShell>

          {draft.adType === 'ctwa' ? (
            <SectionShell number="5" title="Conversation Entry Settings">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel label="Prefilled WhatsApp Text">
                  <textarea
                    value={draft.prefilledText}
                    onChange={(event) => updateDraft({ prefilledText: event.target.value })}
                    rows={3}
                    className={textInputClass()}
                    placeholder="Hi, I want to know more about your offer."
                  />
                </FieldLabel>
                <FieldLabel label="Icebreakers">
                  <textarea
                    value={draft.icebreakers}
                    onChange={(event) => updateDraft({ icebreakers: event.target.value })}
                    rows={3}
                    className={textInputClass()}
                    placeholder={'Pricing\nBook a demo\nTalk to sales'}
                  />
                </FieldLabel>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                These values shape the conversation handoff after the user taps the ad CTA.
              </p>
            </SectionShell>
          ) : null}

          <SectionShell number={draft.adType === 'ctwa' ? '6' : '5'} title="Budget and Schedule">
            <div className="grid gap-4 md:grid-cols-4">
              <FieldLabel label="Budget Type">
                <DropdownSelect
                  value={draft.budgetMode}
                  onChange={(nextBudgetMode) => updateDraft({ budgetMode: nextBudgetMode as BudgetMode })}
                  options={[
                    { value: 'daily', label: 'Daily Budget' },
                    { value: 'lifetime', label: 'Lifetime Budget' },
                  ]}
                  ariaLabel="Select budget type"
                  buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                />
              </FieldLabel>
              <FieldLabel label={`Budget (${budgetCurrency})`}>
                <input
                  value={draft.budget}
                  onChange={(event) => updateDraft({ budget: event.target.value })}
                  className={textInputClass()}
                  placeholder="1000"
                />
              </FieldLabel>
              <FieldLabel label="Start Date">
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => updateDraft({ startDate: event.target.value })}
                  className={textInputClass()}
                />
              </FieldLabel>
              <FieldLabel label="End Date">
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => updateDraft({ endDate: event.target.value })}
                  className={textInputClass()}
                />
              </FieldLabel>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              Budget entry here mirrors the campaign structure. Meta will still bill the connected ad account according to
              its own billing setup when the create-campaign endpoint is wired.
            </div>
          </SectionShell>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={validationMessages.length > 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1381FF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Publish
            </button>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            <p className="font-semibold">Meta app rights needed</p>
            <p className="mt-1">
              Use a Business app with Marketing API. Request `ads_management` plus Ads Management Standard Access for
              campaign creation, `ads_read` for reporting, and Page permissions such as `pages_show_list`,
              `pages_read_engagement`, and `pages_manage_ads` so Page-owned assets can actually be attached to the ad.
            </p>
          </div>
        </motion.div>

        <AnimatePresence initial={false} mode="popLayout">
          {isPlacementPreviewVisible ? (
            <motion.div
              key="placement-preview-rail"
              layout
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: 160, scale: 0.96, filter: 'blur(12px)' }
              }
              animate={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }
              }
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: 220, scale: 0.94, filter: 'blur(18px)' }
              }
              transition={PREVIEW_PANEL_TRANSITION}
              className={PREVIEW_RAIL_WIDTH_CLASS}
            >
              <AdPreview
                draft={draft}
                pageName={selectedPageName}
                readinessChecks={readinessChecks}
                onToggleVisibility={() => setIsPlacementPreviewVisible(false)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      {isMediaGalleryOpen ? (
        <MediaGalleryModal
          localAssets={localMediaAssets}
          metaAssets={metaMediaAssets}
          isLoading={isMediaLibraryLoading}
          error={mediaLibraryError}
          onClose={() => setIsMediaGalleryOpen(false)}
          onRefresh={() => void loadMetaMediaLibrary()}
          onUpload={handleMediaUpload}
          onSelect={selectMediaAsset}
        />
      ) : null}
    </div>
  );
}
