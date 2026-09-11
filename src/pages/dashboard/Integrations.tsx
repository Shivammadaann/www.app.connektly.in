import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import IntegrationBrandIcon from '../../components/IntegrationBrandIcon';
import MetaVerifiedIcon from '../../components/MetaVerifiedIcon';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import facebookIconUrl from '../../assets/Facebook.svg';
import { hasMetaAdsLoginConfig, hasMetaLeadCaptureLoginConfig } from '../../lib/config';
import { beginMetaAdsLogin, beginMetaLeadCaptureLogin } from '../../lib/meta-sdk';
import { useAppData } from '../../context/AppDataContext';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import Channels from './Channels';
import type {
  MetaLeadCaptureSetupResponse,
  MetaAdsIntegrationSetupResponse,
} from '../../lib/types';

interface MetaAdsFormState {
  pageId: string;
  adAccountId: string;
}

type ConnectionId = 'meta-lead-capture' | 'meta-ads-manager' | 'advanced';
type ConnectionIcon = 'lead-capture' | 'ads' | 'advanced';

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
  useBodyScrollLock();

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
  if (icon === 'lead-capture') {
    return <IntegrationBrandIcon brand="lead-capture" className={className} />;
  }

  if (icon === 'ads') {
    return <IntegrationBrandIcon brand="ads" className={className} />;
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
  const pathParts = location.pathname.split('/').filter(Boolean);
  const connectionSlug = pathParts[pathParts.length - 1];
  const sectionParam = searchParams.get('section');
  const hasIntegrationContext =
    Boolean(searchParams.get('integration')) ||
    ['meta', 'meta-lead-capture', 'meta-ads', 'meta-ads-manager', 'advanced'].includes(
      connectionSlug,
    );
  const activeConnectionsSection =
    sectionParam === 'integrations' || (sectionParam !== 'channels' && hasIntegrationContext)
      ? 'integrations'
      : 'channels';
  const { refresh } = useAppData();
  const [metaSetup, setMetaSetup] = useState<MetaLeadCaptureSetupResponse | null>(null);
  const [metaAdsSetup, setMetaAdsSetup] = useState<MetaAdsIntegrationSetupResponse | null>(null);
  const [isMetaSetupLoading, setIsMetaSetupLoading] = useState(true);
  const [isMetaAdsSetupLoading, setIsMetaAdsSetupLoading] = useState(true);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isMetaAdsModalOpen, setIsMetaAdsModalOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<ConnectionId>('meta-lead-capture');
  const [metaAdsForm, setMetaAdsForm] = useState<MetaAdsFormState>(() => buildMetaAdsForm(null));
  const [metaAdsAccessToken, setMetaAdsAccessToken] = useState('');
  const [metaAdsOauthState, setMetaAdsOauthState] = useState('');
  const [isConnectingFacebook, setIsConnectingFacebook] = useState(false);
  const [isConnectingAds, setIsConnectingAds] = useState(false);
  const [isSavingAds, setIsSavingAds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMetaSetup = async () => {
    try {
      setIsMetaSetupLoading(true);
      const response = await appApi.getMetaLeadCaptureSetup();
      setMetaSetup(response);
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

  useEffect(() => {
    const integration = searchParams.get('integration');
    if (integration === 'meta-lead-capture') {
      setSelectedConnectionId('meta-lead-capture');
      setIsMetaModalOpen(true);
      return;
    }

    if (integration === 'meta-ads') {
      setSelectedConnectionId('meta-ads-manager');
      setIsMetaAdsModalOpen(true);
      return;
    }

  }, [searchParams]);

  useEffect(() => {
    if (connectionSlug === 'meta' || connectionSlug === 'meta-lead-capture') {
      setSelectedConnectionId('meta-lead-capture');
      return;
    }

    if (connectionSlug === 'meta-ads' || connectionSlug === 'meta-ads-manager') {
      setSelectedConnectionId('meta-ads-manager');
      return;
    }

    if (connectionSlug === 'connections' || connectionSlug === 'integrations') {
      setSelectedConnectionId('meta-lead-capture');
    }
  }, [location.pathname]);

  const metaLeadCaptureConnected = useMemo(() => {
    if (!metaSetup) {
      return false;
    }

    return Boolean(
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

  const closeMetaModal = () => {
    setIsMetaModalOpen(false);
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

  const openMetaModal = () => {
    setSelectedConnectionId('meta-lead-capture');
    setIsMetaModalOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'meta-lead-capture');
      return next;
    });
  };

  const openMetaAdsModal = () => {
    setSelectedConnectionId('meta-ads-manager');
    setIsMetaAdsModalOpen(true);
    setError(null);
    setSuccess(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('integration', 'meta-ads');
      return next;
    });
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
      await refresh();
      setSuccess('Meta Lead Capture is connected with Facebook embedded login.');
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

  const connections: ConnectionListItem[] = [
    {
      id: 'meta-lead-capture',
      name: 'Meta Lead Capture',
      shortStatus: metaLeadCaptureConnected ? 'Ready' : 'Not connected',
      connected: metaLeadCaptureConnected,
      icon: 'lead-capture',
      description:
        'Collect leads from Facebook lead forms using Facebook embedded login setup.',
    },
    {
      id: 'meta-ads-manager',
      name: 'Meta Ads Manager',
      shortStatus: metaAdsSetup?.config?.adAccountName || (metaAdsConnected ? 'Ready' : 'Not connected'),
      connected: metaAdsConnected,
      icon: 'ads',
      description:
        'Connect a Facebook Page and ad account for Meta campaign setup and ad management.',
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

  const setConnectionsSection = (section: 'channels' | 'integrations') => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('section', section);

      if (section === 'channels') {
        next.delete('integration');
      } else {
        next.delete('channel');
        next.delete('setup');
      }

      return next;
    });
  };

  const renderSectionToggle = () => (
    <div className="inline-flex w-fit rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">
      {[
        { id: 'channels', label: 'Channels' },
        { id: 'integrations', label: 'Integrations' },
      ].map((section) => {
        const isActive = activeConnectionsSection === section.id;

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => setConnectionsSection(section.id as 'channels' | 'integrations')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-[#2364ff] text-white shadow-sm shadow-[#2364ff]/20'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );

  const renderConnectionsHeader = () => (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect and manage channels, integrations, and account setup from here.
        </p>
      </div>
      <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-100">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {activeConnectionsSection === 'channels'
          ? 'Channels'
          : `${connectedConnectionCount} of ${connections.length} connected`}
      </div>
    </div>
  );
  const selectedConnectionStatusLabel = selectedConnection.connected ? 'Connected' : 'Not connected';

  const metaAdsRows: ConnectionStatusRow[] = [
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
      label: 'Page',
      account: metaAdsSetup?.config?.pageName || metaAdsSetup?.config?.pageId || 'No Facebook Page selected',
      detail: metaAdsConnected
        ? 'This Page is available for Meta campaign setup.'
        : 'Connect with Facebook, then choose the Page used for ads.',
      statusText: metaAdsConnected ? 'Selected' : 'Needs setup',
      statusTone: metaAdsConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
  ];

  const leadCaptureRows: ConnectionStatusRow[] = [
    {
      label: 'Lead Capture',
      account: metaSetup?.config?.pageIds.length
        ? `${metaSetup.config.pageIds.length} Page${metaSetup.config.pageIds.length === 1 ? '' : 's'} configured`
        : 'No lead capture Page configured',
      detail: metaSetup?.config?.accessTokenLast4
        ? 'Facebook embedded login is connected and ready to sync lead forms.'
        : 'Use Facebook embedded login to collect Meta leads.',
      statusText: metaLeadCaptureConnected ? 'Ready' : 'Optional',
      statusTone: metaLeadCaptureConnected
        ? 'text-green-700 bg-green-50 border-green-200'
        : 'text-gray-700 bg-gray-50 border-gray-200',
    },
    {
      label: 'Facebook Login',
      account: metaSetup?.config?.accessTokenLast4
        ? `Page access token saved, ending in ${metaSetup.config.accessTokenLast4}`
        : 'Facebook embedded login is not connected',
      detail: metaSetup?.config?.accessTokenLast4
        ? 'Connektly can retrieve lead fields from the connected Facebook Pages.'
        : 'Connect with Facebook so Connektly can retrieve lead fields from your Pages.',
      statusText: metaLeadCaptureConnected ? 'Ready' : 'Needs setup',
      statusTone: metaLeadCaptureConnected
        ? 'text-blue-700 bg-blue-50 border-blue-200'
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
    selectedConnection.id === 'meta-lead-capture'
      ? leadCaptureRows
      : selectedConnection.id === 'meta-ads-manager'
        ? metaAdsRows
        : advancedRows;

  const renderPrimaryAction = () => {
    if (selectedConnection.id === 'meta-lead-capture') {
      return (
        <button
          type="button"
          onClick={openMetaModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <img src={facebookIconUrl} alt="" className="h-4 w-4 object-contain" draggable={false} />
          {metaLeadCaptureConnected ? 'Manage Lead Capture' : 'Connect Lead Capture'}
        </button>
      );
    }

    if (selectedConnection.id === 'meta-ads-manager') {
      return (
        <button
          type="button"
          onClick={openMetaAdsModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2364ff] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#2364ff]/20 transition duration-200 hover:-translate-y-px hover:bg-[#1d54d9] active:scale-[0.97]"
        >
          <CheckCircle2 className="h-4 w-4" />
          {metaAdsConnected ? 'Manage Ads Manager' : 'Connect Ads Manager'}
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

  if (activeConnectionsSection === 'channels') {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {renderConnectionsHeader()}
        {renderSectionToggle()}
        <Channels hideHeader />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {renderConnectionsHeader()}
      {renderSectionToggle()}

      {error && !isMetaModalOpen && !isMetaAdsModalOpen ? (
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
                <Loader2 className="h-6 w-6 animate-spin text-[#1381FF]" />
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
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1381FF]">Connect assets</p>
                      <h3 className="mt-2 text-2xl font-bold text-gray-900">Select Page and ad account</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                        Facebook login opens from Connections. After saving, Meta Ads Manager can use this Page and ad account for campaign setup.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAdsFacebookConnect()}
                      disabled={isConnectingAds || !hasMetaAdsLoginConfig}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1381FF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
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
                        buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
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
                        buttonClassName="rounded-2xl border-gray-200 bg-white px-4 py-3 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
                      />
                    </div>
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
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#1381FF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
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

      {isMetaModalOpen ? (
        <ModalShell
          title="Meta Lead Capture"
          subtitle="Connect Meta lead capture with Facebook embedded login."
          onClose={closeMetaModal}
        >
          <div className="space-y-6">
            {error ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}
            {success ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
            ) : null}

            <div className="rounded-[28px] border border-gray-200 bg-[#f8fbff] p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center">
                    <img src={facebookIconUrl} alt="" className="h-14 w-14 object-contain" draggable={false} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2364ff]">Facebook embedded login</p>
                    <h3 className="mt-2 text-2xl font-bold text-gray-900">Connect Facebook Lead Ads</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                      Launch the Meta login flow to grant Page and lead retrieval permissions. Connektly uses this access to sync Facebook lead form submissions into your lead list.
                    </p>
                  </div>
                </div>
                {isMetaSetupLoading ? <Loader2 className="h-5 w-5 animate-spin text-[#1381FF]" /> : null}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Pages</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {metaSetup?.config?.pageIds.length
                      ? `${metaSetup.config.pageIds.length} configured`
                      : 'Not connected'}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Lead access</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {metaSetup?.config?.accessTokenLast4 ? `Token ends ${metaSetup.config.accessTokenLast4}` : 'Not granted'}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Page subscriptions</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {allLeadPagesSubscribed ? 'Connected' : 'Pending'}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-2xl text-sm leading-6 text-gray-600">
                  Required Meta permissions are requested during login. Make sure the Facebook user has access to the Pages and lead forms in Meta Business Manager.
                </p>
                <button
                  type="button"
                  onClick={handleFacebookConnect}
                  disabled={isConnectingFacebook || !hasMetaLeadCaptureLoginConfig}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1381FF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isConnectingFacebook ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <img src={facebookIconUrl} alt="" className="h-4 w-4 object-contain" draggable={false} />
                  )}
                  {hasMetaLeadCaptureLoginConfig
                    ? metaLeadCaptureConnected
                      ? 'Reconnect with Facebook'
                      : 'Connect with Facebook'
                    : 'Meta app ID unavailable'}
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

