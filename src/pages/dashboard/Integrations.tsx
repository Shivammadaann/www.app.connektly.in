import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCcw,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import IntegrationBrandIcon from '../../components/IntegrationBrandIcon';
import MetaVerifiedIcon from '../../components/MetaVerifiedIcon';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import facebookIconUrl from '../../assets/Facebook.svg';
import wooIconUrl from '../../assets/woo.svg';
import { clientConfig, hasMetaAdsLoginConfig, hasMetaLeadCaptureLoginConfig } from '../../lib/config';
import { beginMetaAdsLogin, beginMetaLeadCaptureLogin } from '../../lib/meta-sdk';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import type {
  MetaLeadCaptureSetupResponse,
  MetaAdsIntegrationSetupResponse,
  EmailConnectionSummary,
} from '../../lib/types';

interface WebhookFormState {
  appId: string;
  pageIds: string;
  formIds: string;
  accessToken: string;
}

interface MetaAdsFormState {
  pageId: string;
  adAccountId: string;
}

type ConnectionId = 'meta' | 'whatsapp-business' | 'email-provider' | 'woocommerce' | 'advanced';
type ConnectionIcon = 'meta' | 'whatsapp' | 'email' | 'woocommerce' | 'advanced';

interface ConnectionListItem {
  id: ConnectionId;
  name: string;
  shortStatus: string;
  connected: boolean;
  icon: ConnectionIcon;
  description: string;
}

interface ConnectionStatusRow {
  label: string;
  account: string;
  detail: string;
  statusText: string;
  statusTone: string;
}

type WooCommerceAutomationId =
  | 'abandoned-recovery'
  | 'order-confirmation'
  | 'order-fulfilled'
  | 'purchase-follow-up'
  | 'return-exchange';

interface WooCommerceAutomationDefinition {
  id: WooCommerceAutomationId;
  title: string;
  description: string;
  triggerLabel: string;
  hasDelay: boolean;
  defaultDelayMinutes?: number;
}

interface WooCommerceAutomationState {
  enabled: boolean;
  templateKey: string;
  sendAfterMinutes: number;
}

type WooCommerceAutomationSettings = Record<WooCommerceAutomationId, WooCommerceAutomationState>;

interface WooCommerceConnectionFormState {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const WOOCOMMERCE_DELAY_OPTIONS = [5, 10, 15, 30, 45, 60, 120, 360, 720, 1440, 2880, 10080];

const WOOCOMMERCE_AUTOMATIONS: WooCommerceAutomationDefinition[] = [
  {
    id: 'abandoned-recovery',
    title: 'Abandoned Recovery Message',
    description:
      'Recover abandoned carts by reaching customers on WhatsApp after a cart is left behind.',
    triggerLabel: 'Cart abandoned',
    hasDelay: true,
    defaultDelayMinutes: 30,
  },
  {
    id: 'order-confirmation',
    title: 'Order completed/confirmation',
    description:
      'Send an order confirmation as soon as a customer places an order. The selected template can include a coupon code for the next order.',
    triggerLabel: 'Order placed',
    hasDelay: false,
  },
  {
    id: 'order-fulfilled',
    title: 'Order fulfilled',
    description:
      'Send a shipment update when the order is fulfilled in the WooCommerce admin.',
    triggerLabel: 'Order fulfilled',
    hasDelay: false,
  },
  {
    id: 'purchase-follow-up',
    title: 'Follow up after Purchase',
    description:
      'Send a follow-up WhatsApp message after the purchase date using the selected delay.',
    triggerLabel: 'Purchase completed',
    hasDelay: true,
    defaultDelayMinutes: 1440,
  },
  {
    id: 'return-exchange',
    title: 'Return and exchange request',
    description:
      'Send a WhatsApp update when a refund, return, or exchange request is created.',
    triggerLabel: 'Refund requested',
    hasDelay: false,
  },
];

function buildWooCommerceAutomationSettings(): WooCommerceAutomationSettings {
  return Object.fromEntries(
    WOOCOMMERCE_AUTOMATIONS.map((automation) => [
      automation.id,
      {
        enabled: false,
        templateKey: '',
        sendAfterMinutes: automation.defaultDelayMinutes || 0,
      },
    ]),
  ) as WooCommerceAutomationSettings;
}

function buildWooCommerceAutomationSettingsFromList(
  settings: Array<{ id: string; enabled: boolean; templateKey: string; sendAfterMinutes: number }> | null | undefined,
): WooCommerceAutomationSettings {
  const defaults = buildWooCommerceAutomationSettings();

  for (const setting of settings || []) {
    if (setting.id in defaults) {
      defaults[setting.id as WooCommerceAutomationId] = {
        enabled: setting.enabled,
        templateKey: setting.templateKey,
        sendAfterMinutes: setting.sendAfterMinutes,
      };
    }
  }

  return defaults;
}

function buildWooCommerceAutomationPayload(settings: WooCommerceAutomationSettings) {
  return WOOCOMMERCE_AUTOMATIONS.map((automation) => ({
    id: automation.id,
    enabled: settings[automation.id].enabled,
    templateKey: settings[automation.id].templateKey,
    sendAfterMinutes: settings[automation.id].sendAfterMinutes,
  }));
}

function formatWooCommerceDelayOption(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${minutes} minutes (${days} ${days === 1 ? 'day' : 'days'})`;
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${minutes} minutes (${hours} ${hours === 1 ? 'hour' : 'hours'})`;
  }

  return `${minutes} minutes`;
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function joinList(values: string[]) {
  return values.join('\n');
}

function buildWebhookForm(setup: MetaLeadCaptureSetupResponse | null) {
  return {
    appId: setup?.config.appId || clientConfig.meta.appId || '',
    pageIds: joinList(setup?.config.pageIds || []),
    formIds: joinList(setup?.config.formIds || []),
    accessToken: '',
  } satisfies WebhookFormState;
}

function buildMetaAdsForm(setup: MetaAdsIntegrationSetupResponse | null) {
  return {
    pageId: setup?.config?.pageId || setup?.pages[0]?.pageId || '',
    adAccountId: setup?.config?.adAccountId || setup?.adAccounts[0]?.adAccountId || '',
  } satisfies MetaAdsFormState;
}

function getMetaAdsAdAccountLabel(account: MetaAdsIntegrationSetupResponse['adAccounts'][number]) {
  const accountNumber = account.accountId || account.adAccountId.replace(/^act_/, '');
  return `${account.name || 'Ad account'}${accountNumber ? ` (${accountNumber})` : ''}`;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeKey(true, onClose);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
      <div className="relative flex min-h-full items-center justify-center px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/40 bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConnectionListIcon({ icon, className = 'h-11 w-11' }: { icon: ConnectionIcon; className?: string }) {
  if (icon === 'meta') {
    return <IntegrationBrandIcon brand="meta" className={className} />;
  }

  if (icon === 'whatsapp') {
    return <ChannelBrandIcon channel="whatsapp" className={className} alt="" />;
  }

  if (icon === 'email') {
    return <IntegrationBrandIcon brand="email" className={className} />;
  }

  if (icon === 'woocommerce') {
    return <img src={wooIconUrl} alt="" className={`object-contain ${className}`} draggable={false} />;
  }

  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
      <Webhook className="h-5 w-5" />
    </span>
  );
}

function ConnectionListButton({
  item,
  isActive,
  onClick,
}: {
  item: ConnectionListItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition duration-200 ${
        isActive
          ? 'bg-[#eff3ff] text-[#153f9c] ring-1 ring-[#cdddff]'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      <ConnectionListIcon icon={item.icon} className="h-10 w-10 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.name}</span>
        <span className="mt-1 block truncate text-xs text-gray-500">{item.shortStatus}</span>
      </span>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          item.connected ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      />
    </button>
  );
}

function ConnectionStatusTable({ rows }: { rows: ConnectionStatusRow[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Connection health</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500">Live setup state and the next thing to review.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-4 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)_160px] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{row.label}</p>
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-gray-900">{row.account}</p>
              <p className="mt-1 text-sm leading-6 text-gray-500">{row.detail}</p>
            </div>
            <div className="lg:text-right">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${row.statusTone}`}>
                {row.statusText}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bootstrap, refresh } = useAppData();
  const [metaSetup, setMetaSetup] = useState<MetaLeadCaptureSetupResponse | null>(null);
  const [metaAdsSetup, setMetaAdsSetup] = useState<MetaAdsIntegrationSetupResponse | null>(null);
  const [wooCommerceSetup, setWooCommerceSetup] =
    useState<Awaited<ReturnType<typeof appApi.getWooCommerceSetup>> | null>(null);
  const [emailConnection, setEmailConnection] = useState<EmailConnectionSummary | null>(null);
  const [isMetaSetupLoading, setIsMetaSetupLoading] = useState(true);
  const [isMetaAdsSetupLoading, setIsMetaAdsSetupLoading] = useState(true);
  const [isWooCommerceSetupLoading, setIsWooCommerceSetupLoading] = useState(true);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isMetaAdsModalOpen, setIsMetaAdsModalOpen] = useState(false);
  const [isWooCommerceModalOpen, setIsWooCommerceModalOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<ConnectionId>('meta');
  const [metaModalMode, setMetaModalMode] = useState<'options' | 'webhook'>('options');
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>(() => buildWebhookForm(null));
  const [metaAdsForm, setMetaAdsForm] = useState<MetaAdsFormState>(() => buildMetaAdsForm(null));
  const [metaAdsAccessToken, setMetaAdsAccessToken] = useState('');
  const [metaAdsOauthState, setMetaAdsOauthState] = useState('');
  const [wooCommerceForm, setWooCommerceForm] = useState<WooCommerceConnectionFormState>({
    storeUrl: '',
    consumerKey: '',
    consumerSecret: '',
  });
  const [wooCommerceAutomations, setWooCommerceAutomations] =
    useState<WooCommerceAutomationSettings>(() => buildWooCommerceAutomationSettings());
  const [wooCommerceWebhookSecret, setWooCommerceWebhookSecret] = useState<string | null>(null);
  const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);
  const [isConnectingAds, setIsConnectingAds] = useState(false);
  const [isSavingAds, setIsSavingAds] = useState(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isVerifyingWooCommerce, setIsVerifyingWooCommerce] = useState(false);
  const [isSavingWooCommerce, setIsSavingWooCommerce] = useState(false);
  const [isDisconnectingWooCommerce, setIsDisconnectingWooCommerce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedField, setCopiedField] =
    useState<'callback' | 'token' | 'woo-callback' | 'woo-secret' | null>(null);

  const loadMetaSetup = async () => {
    try {
      setIsMetaSetupLoading(true);
      const response = await appApi.getMetaLeadCaptureSetup();
      setMetaSetup(response);
      setWebhookForm((current) => ({
        ...buildWebhookForm(response),
        accessToken: '',
        appId: current.appId || response.config.appId || clientConfig.meta.appId || '',
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta Lead Capture setup.');
    } finally {
      setIsMetaSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadMetaSetup();
  }, []);

  const loadMetaAdsSetup = async () => {
    try {
      setIsMetaAdsSetupLoading(true);
      const response = await appApi.getMetaAdsIntegrationSetup();
      setMetaAdsSetup(response);
      setMetaAdsForm(buildMetaAdsForm(response));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta Ads Manager integration.');
    } finally {
      setIsMetaAdsSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadMetaAdsSetup();
  }, []);

  const loadWooCommerceSetup = async () => {
    try {
      setIsWooCommerceSetupLoading(true);
      const response = await appApi.getWooCommerceSetup();
      setWooCommerceSetup(response);
      setWooCommerceAutomations(buildWooCommerceAutomationSettingsFromList(response.connection?.automations));
      setWooCommerceForm((current) => ({
        storeUrl: response.connection?.storeUrl || current.storeUrl,
        consumerKey: '',
        consumerSecret: '',
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load WooCommerce connection.');
    } finally {
      setIsWooCommerceSetupLoading(false);
    }
  };

  useEffect(() => {
    void loadWooCommerceSetup();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadEmailConnection = async () => {
      try {
        const response = await appApi.getEmailConnection();

        if (!cancelled) {
          setEmailConnection(response.connection);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load email integration.');
        }
      }
    };

    void loadEmailConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const integration = searchParams.get('integration');
    if (integration === 'meta-lead-capture') {
      setIsMetaModalOpen(true);
      setMetaModalMode('options');
      return;
    }

    if (integration === 'meta-ads') {
      setIsMetaAdsModalOpen(true);
      return;
    }

    if (integration === 'woocommerce') {
      setIsWooCommerceModalOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const connectionSlug = pathParts[pathParts.length - 1];

    if (connectionSlug === 'meta') {
      setSelectedConnectionId('meta');
      return;
    }

    if (connectionSlug === 'whatsapp') {
      setSelectedConnectionId('whatsapp-business');
      return;
    }

    if (connectionSlug === 'email') {
      setSelectedConnectionId('email-provider');
      return;
    }

    if (connectionSlug === 'woocommerce') {
      setSelectedConnectionId('woocommerce');
      return;
    }

    if (connectionSlug === 'connections' || connectionSlug === 'integrations') {
      setSelectedConnectionId('meta');
    }
  }, [location.pathname]);

  const metaLeadCaptureConnected = useMemo(() => {
    if (!metaSetup) {
      return false;
    }

    return Boolean(
      metaSetup.config.verifiedAt &&
        metaSetup.config.pageIds.length &&
        metaSetup.config.accessTokenLast4 &&
        metaSetup.config.status === 'ready',
    );
  }, [metaSetup]);

  const allLeadPagesSubscribed = useMemo(() => {
    if (!metaSetup?.pageSubscriptions.length) {
      return false;
    }

    return metaSetup.pageSubscriptions.every((subscription) => subscription.subscribed);
  }, [metaSetup]);

  const metaAdsConnected = useMemo(
    () =>
      Boolean(
        metaAdsSetup?.config?.status === 'ready' &&
          metaAdsSetup.config.pageId &&
          metaAdsSetup.config.adAccountId,
      ),
    [metaAdsSetup],
  );

  const wooCommerceConnected = wooCommerceSetup?.connection?.status === 'connected';
  const enabledWooCommerceAutomationCount = WOOCOMMERCE_AUTOMATIONS.filter(
    (automation) => wooCommerceAutomations[automation.id].enabled,
  ).length;
  const approvedTemplateOptions = useMemo(
    () =>
      (bootstrap?.templates || [])
        .filter((template) => (template.status || '').toUpperCase() === 'APPROVED')
        .map((template) => ({
          key: `${template.name}:${template.language}`,
          label: `${template.name} (${template.language})`,
        })),
    [bootstrap?.templates],
  );

  const closeMetaModal = () => {
    setIsMetaModalOpen(false);
    setMetaModalMode('options');
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('integration');
      return next;
    });
  };

  const closeMetaAdsModal = () => {
    setIsMetaAdsModalOpen(false);
    setMetaAdsAccessToken('');
    setMetaAdsOauthState('');
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('integration');
      return next;
    });
  };

  const closeWooCommerceModal = () => {
    setIsWooCommerceModalOpen(false);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('integration');
      return next;
    });
  };

  const openMetaModal = () => {
    setIsMetaModalOpen(true);
    setMetaModalMode('options');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'meta-lead-capture');
      return next;
    });
  };

  const openMetaAdsModal = () => {
    setIsMetaAdsModalOpen(true);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'meta-ads');
      return next;
    });
  };

  const openWooCommerceModal = () => {
    setIsWooCommerceModalOpen(true);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'woocommerce');
      return next;
    });
  };

  const updateWooCommerceAutomation = (
    automationId: WooCommerceAutomationId,
    nextValues: Partial<WooCommerceAutomationState>,
  ) => {
    setWooCommerceAutomations((current) => ({
      ...current,
      [automationId]: {
        ...current[automationId],
        ...nextValues,
      },
    }));
  };

  const handleSaveWooCommerceAutomations = () => {
    if (!wooCommerceSetup?.connection) {
      setError('Connect WooCommerce before saving automated messages.');
      setSuccess(null);
      return;
    }

    const enabledAutomations = WOOCOMMERCE_AUTOMATIONS.filter(
      (automation) => wooCommerceAutomations[automation.id].enabled,
    );
    const missingTemplate = enabledAutomations.find(
      (automation) => !wooCommerceAutomations[automation.id].templateKey,
    );

    if (missingTemplate) {
      setError(`Select a WhatsApp template for ${missingTemplate.title}.`);
      setSuccess(null);
      return;
    }

    const saveAutomations = async () => {
      try {
        setIsSavingWooCommerce(true);
        setError(null);
        setSuccess(null);
        const response = await appApi.updateWooCommerceAutomations(
          buildWooCommerceAutomationPayload(wooCommerceAutomations),
        );
        setWooCommerceSetup(response);
        setWooCommerceAutomations(buildWooCommerceAutomationSettingsFromList(response.connection?.automations));
        setSuccess('WooCommerce automated message settings saved.');
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save WooCommerce automated messages.');
      } finally {
        setIsSavingWooCommerce(false);
      }
    };

    void saveAutomations();
  };

  const handleVerifyWooCommerceConnection = async () => {
    try {
      setIsVerifyingWooCommerce(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.verifyWooCommerceConnection(wooCommerceForm);
      setWooCommerceForm((current) => ({ ...current, storeUrl: response.storeUrl }));
      setSuccess(response.storeName ? `Verified ${response.storeName}.` : 'WooCommerce connection verified.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to verify WooCommerce connection.');
    } finally {
      setIsVerifyingWooCommerce(false);
    }
  };

  const handleSaveWooCommerceConnection = async () => {
    const enabledAutomations = WOOCOMMERCE_AUTOMATIONS.filter(
      (automation) => wooCommerceAutomations[automation.id].enabled,
    );
    const missingTemplate = enabledAutomations.find(
      (automation) => !wooCommerceAutomations[automation.id].templateKey,
    );

    if (missingTemplate) {
      setError(`Select a WhatsApp template for ${missingTemplate.title}.`);
      setSuccess(null);
      return;
    }

    try {
      setIsSavingWooCommerce(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.saveWooCommerceConnection({
        ...wooCommerceForm,
        automations: buildWooCommerceAutomationPayload(wooCommerceAutomations),
      });
      setWooCommerceSetup(response);
      setWooCommerceWebhookSecret(response.webhookSecret || null);
      setWooCommerceAutomations(buildWooCommerceAutomationSettingsFromList(response.connection?.automations));
      setWooCommerceForm({
        storeUrl: response.connection?.storeUrl || wooCommerceForm.storeUrl,
        consumerKey: '',
        consumerSecret: '',
      });
      setSuccess('WooCommerce connected to Connektly.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to connect WooCommerce.');
    } finally {
      setIsSavingWooCommerce(false);
    }
  };

  const handleDisconnectWooCommerce = async () => {
    try {
      setIsDisconnectingWooCommerce(true);
      setError(null);
      setSuccess(null);
      await appApi.disconnectWooCommerceConnection();
      const response = await appApi.getWooCommerceSetup();
      setWooCommerceSetup(response);
      setWooCommerceAutomations(buildWooCommerceAutomationSettings());
      setWooCommerceForm({ storeUrl: '', consumerKey: '', consumerSecret: '' });
      setWooCommerceWebhookSecret(null);
      setSuccess('WooCommerce disconnected.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to disconnect WooCommerce.');
    } finally {
      setIsDisconnectingWooCommerce(false);
    }
  };

  const copyText = async (value: string, field: 'callback' | 'token' | 'woo-callback' | 'woo-secret') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1600);
    } catch {
      return;
    }
  };

  const handleFacebookConnect = async () => {
    try {
      setIsConnectingFacebook(true);
      setError(null);
      setSuccess(null);

      const session = await beginMetaLeadCaptureLogin({ flowState: 'lead_capture_flow' });
      const token = await appApi.exchangeMetaOAuthCode({
        code: session.code,
        redirectUri: session.redirectUri,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });
      const response = await appApi.connectMetaLeadCapture({
        accessToken: token.accessToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });
      setMetaSetup(response);
      setWebhookForm((current) => ({
        ...buildWebhookForm(response),
        accessToken: '',
        appId: current.appId || response.config.appId || clientConfig.meta.appId || '',
      }));
      setMetaModalMode('webhook');
      await refresh();
      setSuccess('Lead Capture permissions connected. Finish or verify the webhook setup below to start capturing leads.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Facebook connection failed.');
    } finally {
      setIsConnectingFacebook(false);
    }
  };

  const handleAdsFacebookConnect = async () => {
    try {
      setIsConnectingAds(true);
      setError(null);
      setSuccess(null);

      const session = await beginMetaAdsLogin({ flowState: 'ads_flow' });
      const token = await appApi.exchangeMetaOAuthCode({
        code: session.code,
        redirectUri: session.redirectUri,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });
      const response = await appApi.getMetaAdsIntegrationOptions({
        accessToken: token.accessToken,
        flowState: session.flowState,
        oauthState: session.oauthState,
      });

      setMetaAdsAccessToken(token.accessToken);
      setMetaAdsOauthState(session.oauthState);
      setMetaAdsSetup((current) => ({
        config: current?.config || response.config,
        pages: response.pages,
        adAccounts: response.adAccounts,
      }));
      setMetaAdsForm(buildMetaAdsForm(response));
      setSuccess('Facebook returned your Pages and ad accounts. Select both and save the integration.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Meta Ads Manager connection failed.');
    } finally {
      setIsConnectingAds(false);
    }
  };

  const handleSaveMetaAdsIntegration = async () => {
    try {
      setIsSavingAds(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.saveMetaAdsIntegration({
        accessToken: metaAdsAccessToken || undefined,
        pageId: metaAdsForm.pageId,
        adAccountId: metaAdsForm.adAccountId,
        flowState: 'ads_flow',
        oauthState: metaAdsOauthState || undefined,
      });

      setMetaAdsAccessToken('');
      setMetaAdsOauthState('');
      setMetaAdsSetup(response);
      setMetaAdsForm(buildMetaAdsForm(response));
      await refresh();
      setSuccess('Meta Ads Manager integration saved. You can now build ad drafts from the Ads section.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save Meta Ads Manager integration.');
    } finally {
      setIsSavingAds(false);
    }
  };

  const handleDisconnectMetaAdsIntegration = async () => {
    try {
      setIsSavingAds(true);
      setError(null);
      setSuccess(null);
      const response = await appApi.disconnectMetaAdsIntegration();
      setMetaAdsAccessToken('');
      setMetaAdsOauthState('');
      setMetaAdsSetup(response);
      setMetaAdsForm(buildMetaAdsForm(response));
      await refresh();
      setSuccess('Meta Ads Manager integration disconnected.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to disconnect Meta Ads Manager integration.');
    } finally {
      setIsSavingAds(false);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      setIsSavingWebhook(true);
      setError(null);
      setSuccess(null);

      const pageIds = splitList(webhookForm.pageIds);
      const formIds = splitList(webhookForm.formIds);
      const hasToken = Boolean(webhookForm.accessToken.trim() || metaSetup?.config.accessTokenLast4);

      let response = await appApi.saveMetaLeadCaptureSetup({
        appId: webhookForm.appId.trim() || clientConfig.meta.appId || null,
        pageIds,
        formIds,
        accessToken: webhookForm.accessToken.trim() || undefined,
        defaultOwnerName: bootstrap?.profile?.fullName || null,
        defaultLabels: ['meta lead'],
        autoCreateLeads: true,
      });

      if (pageIds.length && hasToken) {
        response = await appApi.subscribeMetaLeadCapturePages();
      }

      setMetaSetup(response);
      setWebhookForm((current) => ({
        ...buildWebhookForm(response),
        accessToken: '',
        appId: current.appId || response.config.appId || clientConfig.meta.appId || '',
      }));
      setSuccess('Meta Lead Capture webhook setup saved.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save the webhook setup.');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const metaConnected =
    metaLeadCaptureConnected ||
    metaAdsConnected ||
    Boolean(bootstrap?.instagramChannel) ||
    Boolean(bootstrap?.messengerChannel);
  const whatsAppConnected = Boolean(bootstrap?.channel);

  const connections: ConnectionListItem[] = [
    {
      id: 'meta',
      name: 'Meta',
      shortStatus: metaConnected ? 'Meta assets connected' : 'Not connected',
      connected: metaConnected,
      icon: 'meta',
      description:
        'Manage Facebook Pages, Instagram, Messenger, Ads Manager, and lead forms connected to this workspace.',
    },
    {
      id: 'whatsapp-business',
      name: 'WhatsApp Business',
      shortStatus: bootstrap?.channel?.displayPhoneNumber || (whatsAppConnected ? 'Connected' : 'Not connected'),
      connected: whatsAppConnected,
      icon: 'whatsapp',
      description:
        'Manage the WhatsApp Business Account, phone number connection, messaging setup, and channel health.',
    },
    {
      id: 'email-provider',
      name: 'Email Provider',
      shortStatus: emailConnection?.emailAddress || 'Not connected',
      connected: Boolean(emailConnection),
      icon: 'email',
      description:
        'Connect and manage the email sending provider used for email campaigns, saved templates, and follow-ups.',
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      shortStatus: wooCommerceSetup?.connection?.storeName || (wooCommerceConnected ? 'Connected' : 'Not connected'),
      connected: wooCommerceConnected,
      icon: 'woocommerce',
      description:
        'Configure automated WhatsApp messages for WooCommerce abandoned carts, orders, fulfilment, follow-ups, and return requests.',
    },
    {
      id: 'advanced',
      name: 'Advanced',
      shortStatus: 'Available',
      connected: true,
      icon: 'advanced',
      description:
        'Manage developer connections such as webhooks and API keys for external tools and custom workflows.',
    },
  ];

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) || connections[0];
  const connectedConnectionCount = connections.filter((connection) => connection.connected).length;
  const selectedConnectionStatusLabel = selectedConnection.connected ? 'Connected' : 'Not connected';

  const metaRows: ConnectionStatusRow[] = [
    {
      label: 'Meta Assets',
      account: metaConnected ? 'At least one Meta connection is ready.' : 'No Meta assets are connected yet.',
      detail:
        'Covers Instagram, Messenger, Meta Ads Manager, and lead capture setup for this workspace.',
      statusText: metaConnected ? 'Connected' : 'Not connected',
      statusTone: metaConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'Meta Ads',
      account: metaAdsSetup?.config?.adAccountName || metaAdsSetup?.config?.adAccountId || 'No ad account selected',
      detail: metaAdsSetup?.config?.pageName
        ? `Page: ${metaAdsSetup.config.pageName}`
        : 'Connect a Facebook Page and ad account for the Ads section.',
      statusText: metaAdsConnected ? 'Ready' : 'Needs setup',
      statusTone: metaAdsConnected
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-yellow-700 bg-yellow-50 border-yellow-200',
    },
    {
      label: 'Lead Capture',
      account: metaSetup?.config?.pageIds.length
        ? `${metaSetup.config.pageIds.length} Page${metaSetup.config.pageIds.length === 1 ? '' : 's'} configured`
        : 'No lead capture Page configured',
      detail: metaSetup?.config?.verifiedAt
        ? `Webhook verified on ${new Date(metaSetup.config.verifiedAt).toLocaleString()}`
        : 'Use Facebook login or webhook setup to collect Meta leads.',
      statusText: metaLeadCaptureConnected ? 'Ready' : 'Optional',
      statusTone: metaLeadCaptureConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
  ];

  const whatsappRows: ConnectionStatusRow[] = [
    {
      label: 'Account',
      account:
        bootstrap?.channel?.displayPhoneNumber ||
        bootstrap?.channel?.phoneNumberId ||
        'No WhatsApp number connected',
      detail: bootstrap?.channel?.businessAccountName
        ? `Business account: ${bootstrap.channel.businessAccountName}`
        : 'Connect a WhatsApp Business number before using WhatsApp messaging.',
      statusText: whatsAppConnected ? 'Connected' : 'Disconnected',
      statusTone: whatsAppConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'Channel Health',
      account: bootstrap?.channel?.qualityRating || 'Quality not returned yet',
      detail: 'Open Channels for display name approval, quality rating, webhook, and two-step verification controls.',
      statusText: whatsAppConnected ? 'Review in Channels' : 'Needs setup',
      statusTone: whatsAppConnected
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-yellow-700 bg-yellow-50 border-yellow-200',
    },
  ];

  const emailRows: ConnectionStatusRow[] = [
    {
      label: 'Provider',
      account: emailConnection?.emailAddress || 'Email provider is not connected',
      detail: emailConnection
        ? `SMTP: ${emailConnection.smtpHost}:${emailConnection.smtpPort}`
        : 'Connect SMTP/IMAP before sending email campaigns or using the email inbox.',
      statusText: emailConnection ? 'Connected' : 'Not connected',
      statusTone: emailConnection
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'Verification',
      account: emailConnection?.lastVerifiedAt
        ? new Date(emailConnection.lastVerifiedAt).toLocaleString()
        : 'Not verified yet',
      detail: emailConnection?.displayName
        ? `Sender name: ${emailConnection.displayName}`
        : 'Verification confirms both sending and inbox credentials.',
      statusText: emailConnection?.lastVerifiedAt ? 'Verified' : 'Pending',
      statusTone: emailConnection?.lastVerifiedAt
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-yellow-700 bg-yellow-50 border-yellow-200',
    },
  ];

  const wooCommerceRows: ConnectionStatusRow[] = [
    {
      label: 'Store',
      account: wooCommerceSetup?.connection?.storeName || wooCommerceSetup?.connection?.storeUrl || 'No store connected',
      detail: wooCommerceSetup?.connection?.storeUrl || 'Connect WooCommerce REST API credentials to enable automations.',
      statusText: wooCommerceConnected ? 'Connected' : 'Not connected',
      statusTone: wooCommerceConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'Automations',
      account: `${enabledWooCommerceAutomationCount} automation${enabledWooCommerceAutomationCount === 1 ? '' : 's'} enabled`,
      detail: 'Cart recovery, order updates, fulfilment, follow-up, and return-request messages are managed here.',
      statusText: wooCommerceConnected ? 'Configurable' : 'Connect store first',
      statusTone: wooCommerceConnected
        ? 'text-[#7f54b3] bg-[#f5f0ff] border-[#eadcf8]'
        : 'text-yellow-700 bg-yellow-50 border-yellow-200',
    },
  ];

  const advancedRows: ConnectionStatusRow[] = [
    {
      label: 'Developer Tools',
      account: 'Webhooks and API credentials',
      detail: 'Use Advanced when external tools, internal automations, or custom workflows need programmatic access.',
      statusText: 'Available',
      statusTone: 'text-blue-700 bg-blue-50 border-blue-200',
    },
  ];

  const selectedRows =
    selectedConnection.id === 'meta'
      ? metaRows
      : selectedConnection.id === 'whatsapp-business'
        ? whatsappRows
        : selectedConnection.id === 'email-provider'
          ? emailRows
          : selectedConnection.id === 'woocommerce'
            ? wooCommerceRows
            : advancedRows;

  const renderPrimaryAction = () => {
    if (selectedConnection.id === 'meta') {
      return (
        <>
          <button
            type="button"
            onClick={openMetaAdsModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Meta Ads
          </button>
          <button
            type="button"
            onClick={openMetaModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#2364ff]/20 bg-[#eff3ff] px-4 py-2.5 text-sm font-medium text-[#1d54d9] transition duration-200 hover:-translate-y-px hover:bg-[#e3ebff] active:scale-[0.97]"
          >
            <Webhook className="h-4 w-4" />
            Lead Capture
          </button>
        </>
      );
    }

    if (selectedConnection.id === 'whatsapp-business') {
      return (
        <button
          type="button"
          onClick={() => navigate(whatsAppConnected ? '/dashboard/channels' : '/onboarding/channel-connection')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <CheckCircle2 className="h-4 w-4" />
          {whatsAppConnected ? 'Open Channels' : 'Connect'}
        </button>
      );
    }

    if (selectedConnection.id === 'email-provider') {
      return (
        <button
          type="button"
          onClick={() => navigate(emailConnection ? '/dashboard/emails' : '/dashboard/channels?channel=email&setup=1')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <CheckCircle2 className="h-4 w-4" />
          {emailConnection ? 'Open Email' : 'Connect provider'}
        </button>
      );
    }

    if (selectedConnection.id === 'woocommerce') {
      return (
        <button
          type="button"
          onClick={openWooCommerceModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <CheckCircle2 className="h-4 w-4" />
          {wooCommerceConnected ? 'Manage store' : 'Connect store'}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => navigate('/dashboard/connections/advanced')}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
      >
        <Webhook className="h-4 w-4" />
        Open Advanced
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Connections</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            Manage external platforms, providers, webhooks, and API access from one place.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-100">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {connectedConnectionCount} of {connections.length} connected
        </div>
      </div>

      {error && !isMetaModalOpen && !isMetaAdsModalOpen && !isWooCommerceModalOpen ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Connection center</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">Select a connection to review setup, health, and actions.</p>
          </div>
          <div className="space-y-1 p-3">
            {connections.map((item) => (
              <div key={item.id}>
                <ConnectionListButton
                  item={item}
                  isActive={item.id === selectedConnection.id}
                  onClick={() => setSelectedConnectionId(item.id)}
                />
              </div>
            ))}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <ConnectionListIcon icon={selectedConnection.icon} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">{selectedConnection.name}</h2>
                    {selectedConnection.connected ? <MetaVerifiedIcon className="h-5 w-5 shrink-0" alt="Connected" /> : null}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{selectedConnection.description}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:items-end">
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <span className="mr-2 text-gray-400">Connection Status</span>
                  <span className={selectedConnection.connected ? 'text-emerald-700' : 'text-gray-500'}>
                    {selectedConnectionStatusLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  {renderPrimaryAction()}
                </div>
              </div>
            </div>
          </div>

          <ConnectionStatusTable rows={selectedRows} />
        </section>
      </div>

      {isMetaAdsModalOpen ? (
        <ModalShell
          title="Meta Ads Manager"
          subtitle="Connect the Facebook Page and ad account used by the Ads section."
          onClose={closeMetaAdsModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            {isMetaAdsSetupLoading && !metaAdsSetup ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-gray-200 bg-[#fcfcfd]">
                <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[24px] border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Facebook Page</p>
                    <p className="mt-3 truncate text-sm font-semibold text-gray-900">
                      {metaAdsSetup?.config?.pageName || metaAdsSetup?.config?.pageId || 'Not connected'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {metaAdsSetup?.config?.pageAccessTokenLast4 ? `Token ends ${metaAdsSetup.config.pageAccessTokenLast4}` : 'Required for ad identity'}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Ad Account</p>
                    <p className="mt-3 truncate text-sm font-semibold text-gray-900">
                      {metaAdsSetup?.config?.adAccountName || metaAdsSetup?.config?.adAccountId || 'Not connected'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {metaAdsSetup?.config?.currency || metaAdsSetup?.config?.timezoneName || 'Required for campaigns'}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Status</p>
                    <p className="mt-3 text-sm font-semibold capitalize text-gray-900">
                      {metaAdsSetup?.config?.status || 'Draft'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {metaAdsSetup?.config?.accessTokenLast4 ? (
                        `User token ends ${metaAdsSetup.config.accessTokenLast4}`
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <img src={facebookIconUrl} alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />
                          Connect with Facebook
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfd] p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5b45ff]">Connect assets</p>
                      <h3 className="mt-2 text-2xl font-bold text-gray-900">Select Page and ad account</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                        Facebook login opens from Connections. After saving, Meta Ads Manager can use this Page and ad account for campaign setup.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAdsFacebookConnect()}
                      disabled={isConnectingAds || !hasMetaAdsLoginConfig}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isConnectingAds ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <img src={facebookIconUrl} alt="" className="h-4 w-4 object-contain" draggable={false} />
                      )}
                      {hasMetaAdsLoginConfig ? 'Connect with Facebook' : 'Meta app unavailable'}
                    </button>
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    <div className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Facebook Page</span>
                      <DropdownSelect
                        value={metaAdsForm.pageId}
                        onChange={(nextPageId) => setMetaAdsForm((current) => ({ ...current, pageId: nextPageId }))}
                        options={[
                          { value: '', label: 'Select a Page' },
                          ...(metaAdsSetup?.pages || []).map((page) => ({
                            value: page.pageId,
                            label: page.pageName || page.pageId,
                          })),
                        ]}
                        placeholder="Select a Page"
                        ariaLabel="Select Facebook Page"
                        buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                      />
                    </div>

                    <div className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Ad Account</span>
                      <DropdownSelect
                        value={metaAdsForm.adAccountId}
                        onChange={(nextAdAccountId) => setMetaAdsForm((current) => ({ ...current, adAccountId: nextAdAccountId }))}
                        options={[
                          { value: '', label: 'Select an ad account' },
                          ...(metaAdsSetup?.adAccounts || []).map((account) => ({
                            value: account.adAccountId,
                            label: getMetaAdsAdAccountLabel(account),
                          })),
                        ]}
                        placeholder="Select an ad account"
                        ariaLabel="Select ad account"
                        buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                    Required Meta App permissions: `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, and `pages_manage_ads`. The business user must also have access to the Page and ad account in Meta Business Manager.
                  </div>

                  <div className="mt-6 flex flex-wrap justify-between gap-3">
                    {metaAdsConnected ? (
                      <button
                        type="button"
                        onClick={() => void handleDisconnectMetaAdsIntegration()}
                        disabled={isSavingAds}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Disconnect
                      </button>
                    ) : <span />}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/ads/meta-ads-manager')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Open Meta Ads Manager
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveMetaAdsIntegration()}
                        disabled={isSavingAds || !metaAdsForm.pageId || !metaAdsForm.adAccountId}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingAds ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Save integration
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ModalShell>
      ) : null}

      {isWooCommerceModalOpen ? (
        <ModalShell
          title="WooCommerce Connection"
          subtitle="Connect WooCommerce to Connektly and configure WhatsApp automation triggers."
          onClose={closeWooCommerceModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            <div className="rounded-[28px] border border-[#eadcf8] bg-[#fbf8ff] p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#eadcf8]">
                    <img src={wooIconUrl} alt="" className="h-11 w-11 object-contain" draggable={false} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7f54b3]">Connection Name</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">WooCommerce</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                      WooCommerce Automated Messages send approved WhatsApp templates for cart recovery, order updates, purchase follow-ups, and refund requests.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center justify-center rounded-full border border-[#dbc4ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#7f54b3]">
                  {wooCommerceConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
            </div>

            {isWooCommerceSetupLoading ? (
              <div className="flex min-h-52 items-center justify-center rounded-[28px] border border-gray-200 bg-[#fcfcfd]">
                <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Step 1</p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">Connect your WooCommerce store</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Create WooCommerce REST API keys with read/write permissions, then paste the store URL and credentials here.
                  </p>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-gray-700">Store URL</span>
                      <input
                        type="url"
                        value={wooCommerceForm.storeUrl}
                        onChange={(event) => setWooCommerceForm((current) => ({ ...current, storeUrl: event.target.value }))}
                        placeholder="https://store.example.com"
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                      />
                    </label>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Consumer key</span>
                        <input
                          type="password"
                          value={wooCommerceForm.consumerKey}
                          onChange={(event) => setWooCommerceForm((current) => ({ ...current, consumerKey: event.target.value }))}
                          placeholder={wooCommerceSetup?.connection?.consumerKeyLast4 ? `Saved key ending ${wooCommerceSetup.connection.consumerKeyLast4}` : 'ck_...'}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Consumer secret</span>
                        <input
                          type="password"
                          value={wooCommerceForm.consumerSecret}
                          onChange={(event) => setWooCommerceForm((current) => ({ ...current, consumerSecret: event.target.value }))}
                          placeholder={wooCommerceSetup?.connection?.consumerSecretLast4 ? `Saved secret ending ${wooCommerceSetup.connection.consumerSecretLast4}` : 'cs_...'}
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleVerifyWooCommerceConnection()}
                      disabled={isVerifyingWooCommerce || !wooCommerceForm.storeUrl || !wooCommerceForm.consumerKey || !wooCommerceForm.consumerSecret}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isVerifyingWooCommerce ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveWooCommerceConnection()}
                      disabled={isSavingWooCommerce || !wooCommerceForm.storeUrl || !wooCommerceForm.consumerKey || !wooCommerceForm.consumerSecret}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingWooCommerce ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {wooCommerceSetup?.connection ? 'Update connection' : 'Connect WooCommerce'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Step 2</p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">Webhook callback</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Add this callback URL in WooCommerce webhooks for order and refund events. Use the signing secret shown after first connect.
                  </p>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Delivery URL</p>
                      <p className="mt-2 break-all text-sm font-semibold text-gray-900">{wooCommerceSetup?.callbackUrl || 'Available after setup loads'}</p>
                      {wooCommerceSetup?.callbackUrl ? (
                        <button
                          type="button"
                          onClick={() => void copyText(wooCommerceSetup.callbackUrl, 'woo-callback')}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedField === 'woo-callback' ? 'Copied' : 'Copy URL'}
                        </button>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Signing secret</p>
                      {wooCommerceWebhookSecret ? (
                        <>
                          <p className="mt-2 break-all text-sm font-semibold text-gray-900">{wooCommerceWebhookSecret}</p>
                          <button
                            type="button"
                            onClick={() => void copyText(wooCommerceWebhookSecret, 'woo-secret')}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedField === 'woo-secret' ? 'Copied' : 'Copy secret'}
                          </button>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-600">
                          {wooCommerceSetup?.connection?.webhookSecretLast4
                            ? `Saved secret ending ${wooCommerceSetup.connection.webhookSecretLast4}. Reconnect if you need to generate a new one.`
                            : 'Shown once after the store is connected.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {wooCommerceSetup?.connection ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-[#fcfcfd] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Store</p>
                        <p className="mt-2 break-all text-sm font-semibold text-gray-900">
                          {wooCommerceSetup.connection.storeName || wooCommerceSetup.connection.storeUrl}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-[#fcfcfd] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Last verified</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {wooCommerceSetup.connection.lastVerifiedAt ? new Date(wooCommerceSetup.connection.lastVerifiedAt).toLocaleString() : 'Not verified yet'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {wooCommerceSetup?.connection ? (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectWooCommerce()}
                      disabled={isDisconnectingWooCommerce}
                      className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      {isDisconnectingWooCommerce ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Disconnect WooCommerce
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            <div className="rounded-[28px] border border-amber-100 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
              Automated WhatsApp message templates cannot be modified or edited here because message templates need to be pre-approved by WhatsApp before they can be sent using the API.
            </div>

            <div className="space-y-4">
              {WOOCOMMERCE_AUTOMATIONS.map((automation) => {
                const automationState = wooCommerceAutomations[automation.id];
                const isEnabled = automationState.enabled;

                return (
                  <div key={automation.id} className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-bold text-gray-900">{automation.title}</h4>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                            {automation.triggerLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-600">{automation.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateWooCommerceAutomation(automation.id, { enabled: !isEnabled })}
                        aria-pressed={isEnabled}
                        className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                          isEnabled
                            ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20'
                            : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-white'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isEnabled ? 'bg-white' : 'bg-gray-400'
                          }`}
                        />
                        {isEnabled ? 'On' : 'Off'}
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Select Template</span>
                        <DropdownSelect
                          value={automationState.templateKey}
                          disabled={!isEnabled || approvedTemplateOptions.length === 0}
                          onChange={(nextTemplateKey) =>
                            updateWooCommerceAutomation(automation.id, {
                              templateKey: nextTemplateKey,
                            })
                          }
                          options={[
                            {
                              value: '',
                              label: approvedTemplateOptions.length > 0 ? 'Choose approved WhatsApp template' : 'No approved templates available',
                            },
                            ...approvedTemplateOptions.map((template) => ({
                              value: template.key,
                              label: template.label,
                            })),
                          ]}
                          placeholder={approvedTemplateOptions.length > 0 ? 'Choose approved WhatsApp template' : 'No approved templates available'}
                          ariaLabel={`Select template for ${automation.title}`}
                          buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15 disabled:opacity-60"
                        />
                      </div>

                      {automation.hasDelay ? (
                        <div className="block">
                          <span className="mb-2 block text-sm font-medium text-gray-700">Send message after</span>
                          <DropdownSelect
                            value={String(automationState.sendAfterMinutes)}
                            disabled={!isEnabled}
                            onChange={(nextDelayMinutes) =>
                              updateWooCommerceAutomation(automation.id, {
                                sendAfterMinutes: Number(nextDelayMinutes),
                              })
                            }
                            options={WOOCOMMERCE_DELAY_OPTIONS.map((minutes) => ({
                              value: String(minutes),
                              label: formatWooCommerceDelayOption(minutes),
                            }))}
                            ariaLabel={`Select delay for ${automation.title}`}
                            buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15 disabled:opacity-60"
                          />
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <p className="text-sm font-medium text-gray-700">Send message after</p>
                          <p className="mt-2 text-sm text-gray-500">Immediately when the WooCommerce trigger fires.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeWooCommerceModal}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveWooCommerceAutomations}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save WooCommerce settings
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isMetaModalOpen ? (
        <ModalShell
          title="Meta Lead Capture"
          subtitle="Choose how you want to connect Meta lead capture inside Connektly."
          onClose={closeMetaModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={handleFacebookConnect}
                disabled={isConnectingFacebook || !hasMetaLeadCaptureLoginConfig}
                className="rounded-[28px] border border-gray-200 bg-[#f8fbff] p-6 text-left shadow-sm transition hover:border-[#bfd5ff] hover:bg-[#f1f7ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center">
                    <img src={facebookIconUrl} alt="" className="h-12 w-12 object-contain" draggable={false} />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Connect with Facebook</p>
                    <p className="text-sm text-gray-500">Request lead permissions only</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-gray-600">
                  Open a dedicated Meta OAuth flow for Pages and lead retrieval access. This does not launch WhatsApp onboarding.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#d9e8ff] px-4 py-3 text-sm font-medium text-[#1f4ed8]">
                  {isConnectingFacebook ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <img src={facebookIconUrl} alt="" className="h-4 w-4 object-contain" draggable={false} />
                  )}
                  {hasMetaLeadCaptureLoginConfig ? 'Connect with Facebook' : 'Meta app ID unavailable'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMetaModalMode('webhook')}
                className="rounded-[28px] border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111827] text-white">
                    <Webhook className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-900">Connect via webhook</p>
                    <p className="text-sm text-gray-500">Paste callback details into Meta</p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-gray-600">
                  Configure callback URL, verify token, app ID, page ID, and form mapping for direct Meta lead capture sync.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                  <Webhook className="h-4 w-4" /> Open webhook setup
                </div>
              </button>
            </div>

            {metaModalMode === 'webhook' ? (
              <div className="rounded-[28px] border border-gray-200 bg-[#fcfcfd] p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Webhook setup</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">Connect Meta Lead Capture via webhook</h3>
                    <p className="mt-2 max-w-3xl text-sm text-gray-500">
                      Paste these details into Meta, then save your IDs below. The page access token remains required so Connektly can retrieve lead fields after each webhook hits the server.
                    </p>
                  </div>
                  {isMetaSetupLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#5b45ff]" /> : null}
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Webhook callback URL</p>
                    <p className="mt-3 break-all text-sm font-medium text-gray-900">{metaSetup?.config.callbackUrl || 'Loading...'}</p>
                    {metaSetup?.config.callbackUrl ? (
                      <button
                        type="button"
                        onClick={() => void copyText(metaSetup.config.callbackUrl, 'callback')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Copy className="h-3.5 w-3.5" /> {copiedField === 'callback' ? 'Copied' : 'Copy URL'}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Webhook verify token</p>
                    <p className="mt-3 break-all text-sm font-medium text-gray-900">{metaSetup?.config.verifyToken || 'Loading...'}</p>
                    {metaSetup?.config.verifyToken ? (
                      <button
                        type="button"
                        onClick={() => void copyText(metaSetup.config.verifyToken, 'token')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                      >
                        <Copy className="h-3.5 w-3.5" /> {copiedField === 'token' ? 'Copied' : 'Copy token'}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta App ID</span>
                    <input
                      type="text"
                      value={webhookForm.appId}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, appId: event.target.value }))}
                      placeholder="Meta app ID"
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta Page ID</span>
                    <textarea
                      value={webhookForm.pageIds}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, pageIds: event.target.value }))}
                      rows={3}
                      placeholder={'One Page ID per line\n123456789012345'}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Meta Form ID</span>
                    <textarea
                      value={webhookForm.formIds}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, formIds: event.target.value }))}
                      rows={3}
                      placeholder={'Optional. Leave blank to accept all forms.\n987654321098765'}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Facebook Page Access Token</span>
                    <input
                      type="password"
                      value={webhookForm.accessToken}
                      onChange={(event) => setWebhookForm((current) => ({ ...current, accessToken: event.target.value }))}
                      placeholder={
                        metaSetup?.config.accessTokenLast4
                          ? `Saved token ending in ${metaSetup.config.accessTokenLast4}. Enter a new one only if you want to replace it.`
                          : 'Required to retrieve lead fields after webhook delivery'
                      }
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                    />
                  </label>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Meta-side checklist</p>
                    <p className="mt-2">1. Add the `Webhooks` product in Meta App Dashboard.</p>
                    <p className="mt-1">2. Subscribe the app to the `Page` object and enable `leadgen`.</p>
                    <p className="mt-1">3. Use the callback URL and verify token shown above.</p>
                    <p className="mt-1">4. Grant page and form access in Leads Access Manager.</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Current status</p>
                    <p className="mt-2">Webhook verified: <span className="font-semibold text-gray-900">{metaSetup?.config.verifiedAt ? 'Yes' : 'Pending'}</span></p>
                    <p className="mt-2">Page subscriptions active: <span className="font-semibold text-gray-900">{allLeadPagesSubscribed ? 'Yes' : 'Pending'}</span></p>
                    <p className="mt-2">Last lead sync: <span className="font-semibold text-gray-900">{metaSetup?.config.lastLeadSyncedAt ? new Date(metaSetup.config.lastLeadSyncedAt).toLocaleString() : 'Not available'}</span></p>
                  </div>
                </div>

                {metaSetup?.pageSubscriptions.length ? (
                  <div className="mt-6 grid gap-3">
                    {metaSetup.pageSubscriptions.map((subscription) => (
                      <div key={subscription.pageId} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-mono text-xs text-gray-700">{subscription.pageId}</p>
                            <p className="mt-1 text-gray-500">
                              {subscription.errorMessage
                                ? subscription.errorMessage
                                : subscription.subscribedFields.length
                                  ? `Subscribed fields: ${subscription.subscribedFields.join(', ')}`
                                  : 'No subscribed fields returned yet.'}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              subscription.subscribed
                                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                                : 'border border-amber-100 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {subscription.subscribed ? 'Connected' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setMetaModalMode('options')}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveWebhook()}
                    disabled={isSavingWebhook}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/25 transition hover:bg-[#4a35e8] disabled:opacity-60"
                  >
                    {isSavingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                    Save webhook setup
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

