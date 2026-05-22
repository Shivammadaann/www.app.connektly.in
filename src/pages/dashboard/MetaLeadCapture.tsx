import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import type {
  MetaLeadCaptureConfig,
  MetaLeadCaptureEvent,
  MetaLeadCaptureSetupResponse,
} from '../../lib/types';

interface FormState {
  appId: string;
  pageIds: string;
  formIds: string;
  accessToken: string;
  defaultOwnerName: string;
  defaultLabels: string;
  autoCreateLeads: boolean;
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

function buildForm(config: MetaLeadCaptureConfig | null, defaultOwnerName: string) {
  return {
    appId: config?.appId || '',
    pageIds: joinList(config?.pageIds || []),
    formIds: joinList(config?.formIds || []),
    accessToken: '',
    defaultOwnerName: config?.defaultOwnerName || defaultOwnerName,
    defaultLabels: joinList(config?.defaultLabels || ['meta lead']),
    autoCreateLeads: config?.autoCreateLeads ?? true,
  } satisfies FormState;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getStatusAppearance(status: MetaLeadCaptureConfig['status']) {
  switch (status) {
    case 'ready':
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'error':
      return 'border border-rose-100 bg-rose-50 text-rose-700';
    default:
      return 'border border-amber-100 bg-amber-50 text-amber-700';
  }
}

function getEventStatusAppearance(status: MetaLeadCaptureEvent['processingStatus']) {
  switch (status) {
    case 'processed':
      return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'error':
      return 'border border-rose-100 bg-rose-50 text-rose-700';
    case 'skipped':
      return 'border border-amber-100 bg-amber-50 text-amber-700';
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700';
  }
}

export default function MetaLeadCapture() {
  const { bootstrap } = useAppData();
  const [setup, setSetup] = useState<MetaLeadCaptureSetupResponse | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    buildForm(null, bootstrap?.profile?.fullName || ''),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'callback' | 'verify' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await appApi.getMetaLeadCaptureSetup();

        if (!cancelled) {
          setSetup(response);
          setForm(buildForm(response.config, bootstrap?.profile?.fullName || ''));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta Lead Capture setup.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.profile?.fullName]);

  const checklist = useMemo(() => {
    const config = setup?.config;
    const hasPageSubscriptions = Boolean(config?.pageIds.length);
    const allPagesSubscribed =
      hasPageSubscriptions &&
      Boolean(setup?.pageSubscriptions.length) &&
      Boolean(setup?.pageSubscriptions.every((subscription) => subscription.subscribed));

    return [
      {
        label: 'Page IDs added',
        done: Boolean(config?.pageIds.length),
      },
      {
        label: 'Lead retrieval token saved',
        done: Boolean(config?.accessTokenLast4),
      },
      {
        label: 'Page webhook subscription active',
        done: Boolean(allPagesSubscribed),
      },
      {
        label: 'Webhook verified at Meta',
        done: Boolean(config?.verifiedAt),
      },
      {
        label: 'Lead synced successfully',
        done: Boolean(config?.lastLeadSyncedAt),
      },
    ];
  }, [setup]);

  const handleActivateSubscriptions = async () => {
    try {
      setIsSubscribing(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.subscribeMetaLeadCapturePages();
      setSetup(response);

      if (response.pageSubscriptions.length && response.pageSubscriptions.every((subscription) => subscription.subscribed)) {
        setSuccess('Page webhook subscription activated for the saved Pages.');
        return;
      }

      setError(
        response.config.lastError || 'Some Pages are still not subscribed to the leadgen webhook field.',
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to activate Meta Page subscriptions.',
      );
    } finally {
      setIsSubscribing(false);
    }
  };

  const copyText = async (value: string, field: 'callback' | 'verify') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1600);
    } catch {
      return;
    }
  };

  const handleSave = async (options?: { regenerateVerifyToken?: boolean }) => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await appApi.saveMetaLeadCaptureSetup({
        appId: form.appId.trim() || null,
        pageIds: splitList(form.pageIds),
        formIds: splitList(form.formIds),
        accessToken: form.accessToken.trim() || undefined,
        defaultOwnerName: form.defaultOwnerName.trim() || null,
        defaultLabels: splitList(form.defaultLabels),
        autoCreateLeads: form.autoCreateLeads,
        regenerateVerifyToken: options?.regenerateVerifyToken,
      });

      setSetup(response);
      setForm((current) => ({
        ...buildForm(response.config, bootstrap?.profile?.fullName || ''),
        accessToken: '',
        appId: current.appId,
      }));
      setSuccess(
        options?.regenerateVerifyToken
          ? 'Verify token regenerated and setup saved.'
          : 'Meta Lead Capture setup saved.',
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save Meta Lead Capture setup.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !setup) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Meta Lead Capture</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">
            Receive Meta Lead Ads webhooks, fetch the lead details with your saved Page token, and push those leads into the CRM automatically.
          </p>
        </div>
        <Link
          to="/dashboard/crm/leads"
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          Open Lead List <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-gray-400">Setup</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Connect your Meta Lead Ads webhook</h2>
              <p className="mt-2 text-sm text-gray-500">
                Save the Page IDs you want to ingest, optional Form IDs to narrow the flow, and the Page token used to retrieve each lead after Meta sends the webhook.
              </p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${getStatusAppearance(setup?.config.status || 'draft')}`}>
              {(setup?.config.status || 'draft').charAt(0).toUpperCase() + (setup?.config.status || 'draft').slice(1)}
            </span>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Meta App ID</span>
              <input
                type="text"
                value={form.appId}
                onChange={(event) => setForm((current) => ({ ...current, appId: event.target.value }))}
                placeholder="Optional, for internal reference"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Default owner</span>
              <input
                type="text"
                value={form.defaultOwnerName}
                onChange={(event) => setForm((current) => ({ ...current, defaultOwnerName: event.target.value }))}
                placeholder="Lead owner name"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Page IDs</span>
              <textarea
                value={form.pageIds}
                onChange={(event) => setForm((current) => ({ ...current, pageIds: event.target.value }))}
                rows={4}
                placeholder={'Enter one Page ID per line\n123456789012345'}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Form IDs</span>
              <textarea
                value={form.formIds}
                onChange={(event) => setForm((current) => ({ ...current, formIds: event.target.value }))}
                rows={3}
                placeholder={'Optional. Leave blank to accept all forms from the selected Pages.\n987654321098765'}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Page Access Token</span>
              <input
                type="password"
                value={form.accessToken}
                onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))}
                placeholder={
                  setup?.config.accessTokenLast4
                    ? `Saved token ending in ${setup.config.accessTokenLast4}. Enter a new one only if you want to replace it.`
                    : 'Paste a Page token that can retrieve leadgen IDs'
                }
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
              <p className="mt-2 text-xs text-gray-500">
                This token is stored encrypted on the server and is only used to fetch lead details after the webhook arrives.
              </p>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-gray-700">Default labels</span>
              <textarea
                value={form.defaultLabels}
                onChange={(event) => setForm((current) => ({ ...current, defaultLabels: event.target.value }))}
                rows={3}
                placeholder={'One label per line\nmeta lead\nfacebook lead'}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              />
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 md:col-span-2">
              <input
                type="checkbox"
                checked={form.autoCreateLeads}
                onChange={(event) => setForm((current) => ({ ...current, autoCreateLeads: event.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5b45ff] focus:ring-[#5b45ff]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-create CRM leads</p>
                <p className="mt-1 text-sm text-gray-500">
                  When enabled, each accepted Meta webhook will create or update a lead in your CRM using the fetched lead fields.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSave({ regenerateVerifyToken: true })}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" /> Regenerate verify token
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8] disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save setup
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#5b45ff]">
                <Webhook className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Webhook details</h3>
                <p className="text-sm text-gray-500">Copy these into Meta when you configure the app webhook.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Callback URL</p>
                <p className="mt-2 break-all text-sm font-medium text-gray-900">{setup?.config.callbackUrl}</p>
                <button
                  type="button"
                  onClick={() => void copyText(setup?.config.callbackUrl || '', 'callback')}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <Copy className="h-3.5 w-3.5" /> {copiedField === 'callback' ? 'Copied' : 'Copy URL'}
                </button>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Verify token</p>
                <p className="mt-2 break-all text-sm font-medium text-gray-900">{setup?.config.verifyToken}</p>
                <button
                  type="button"
                  onClick={() => void copyText(setup?.config.verifyToken || '', 'verify')}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <Copy className="h-3.5 w-3.5" /> {copiedField === 'verify' ? 'Copied' : 'Copy token'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Readiness</h3>
                <p className="text-sm text-gray-500">What is already configured and what still needs action.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.done
                        ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                        : 'border border-amber-100 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {item.done ? 'Done' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Page webhook subscriptions</p>
                  <p className="mt-1 text-sm text-gray-500">
                    This activates the `leadgen` webhook field on each saved Facebook Page so Meta can actually send lead events here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleActivateSubscriptions()}
                  disabled={isSubscribing || isSaving || !setup?.config.pageIds.length || !setup?.config.accessTokenLast4}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {isSubscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                  Activate Page subscriptions
                </button>
              </div>

              {setup?.pageSubscriptions.length ? (
                <div className="mt-4 space-y-3">
                  {setup.pageSubscriptions.map((subscription) => (
                    <div
                      key={subscription.pageId}
                      className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-mono text-xs text-gray-700">{subscription.pageId}</p>
                          <p className="mt-1 text-sm text-gray-500">
                            {subscription.appName
                              ? `Matched app: ${subscription.appName}${subscription.appId ? ` (${subscription.appId})` : ''}`
                              : subscription.appId
                                ? `Expected app ID: ${subscription.appId}`
                                : 'Save the Meta App ID to verify the exact subscribed app.'}
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            subscription.subscribed
                              ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                              : 'border border-amber-100 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {subscription.subscribed ? 'Leadgen active' : 'Pending'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">
                        {subscription.errorMessage
                          ? subscription.errorMessage
                          : subscription.subscribedFields.length
                            ? `Subscribed fields: ${subscription.subscribedFields.join(', ')}`
                            : 'No subscribed fields returned yet for this Page.'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : setup?.config.pageIds.length ? (
                <p className="mt-4 text-sm text-gray-500">
                  Save a Page token to check or activate the `leadgen` subscription for each Page.
                </p>
              ) : null}
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <p>Verified at Meta: <span className="font-medium text-gray-900">{formatDateTime(setup?.config.verifiedAt || null)}</span></p>
              <p className="mt-2">Last webhook event: <span className="font-medium text-gray-900">{formatDateTime(setup?.config.lastWebhookAt || null)}</span></p>
              <p className="mt-2">Last lead sync: <span className="font-medium text-gray-900">{formatDateTime(setup?.config.lastLeadSyncedAt || null)}</span></p>
              {setup?.config.lastError ? (
                <p className="mt-2 text-rose-700">Last error: {setup.config.lastError}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Meta dashboard steps</h3>
            <ol className="mt-4 space-y-3 text-sm text-gray-600">
              <li>1. Open your Meta app in the Meta App Dashboard and add the `Webhooks` product.</li>
              <li>2. For the app webhook, paste the callback URL and verify token shown here.</li>
              <li>3. Subscribe the app to the `Page` object and enable the `leadgen` field.</li>
              <li>4. In Business settings, grant your app and token access to each Facebook Page that owns the lead forms.</li>
              <li>5. Generate a Page access token that can retrieve lead data, then save it in this setup screen.</li>
              <li>6. Use Meta’s Lead Ads Testing Tool to submit a test lead and confirm that it appears in the recent events list below.</li>
            </ol>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="https://developers.facebook.com/docs/graph-api/webhooks/getting-started/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-[#2563eb] transition hover:bg-gray-50"
              >
                Webhooks docs <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href="https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-[#2563eb] transition hover:bg-gray-50"
              >
                Lead retrieval docs <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href="https://developers.facebook.com/tools/lead-ads-testing"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-[#2563eb] transition hover:bg-gray-50"
              >
                Lead Ads Testing Tool <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Recent webhook events</h2>
            <p className="mt-2 text-sm text-gray-500">
              These are the latest lead capture events received from Meta and how this workspace processed them.
            </p>
          </div>
        </div>

        {setup?.recentEvents.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Event time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Page ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Form ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Lead ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {setup.recentEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm text-gray-700">{formatDateTime(event.eventTime || event.createdAt)}</td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-700">{event.pageId || 'Not available'}</td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-700">{event.formId || 'All forms'}</td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-700">{event.leadId || 'Not available'}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getEventStatusAppearance(event.processingStatus)}`}>
                        {event.processingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {event.errorMessage || 'Lead processed successfully.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
            <Webhook className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-4 text-lg font-semibold text-gray-900">No webhook events yet</p>
            <p className="mt-2 text-sm text-gray-500">
              After Meta sends a `leadgen` event to the callback URL, it will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
