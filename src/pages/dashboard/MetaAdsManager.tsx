import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Eye,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type {
  MetaAdsCampaignDeliveryFilter,
  MetaAdsCampaignPeriod,
  MetaAdsCampaignsResponse,
  MetaAdsManagedCampaign,
} from '../../lib/types';

const PERIOD_OPTIONS: Array<{ value: MetaAdsCampaignPeriod; label: string }> = [
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'maximum', label: 'Maximum' },
  { value: 'custom', label: 'Custom dates' },
];

const DELIVERY_OPTIONS: Array<{ value: MetaAdsCampaignDeliveryFilter; label: string }> = [
  { value: 'all', label: 'All ads' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function getDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-IN', {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number | null | undefined, currency: string | null | undefined) {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function formatMetaLabel(value: string | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isCampaignActive(campaign: MetaAdsManagedCampaign) {
  return campaign.status === 'ACTIVE';
}

function isCampaignDeliveryActive(campaign: MetaAdsManagedCampaign) {
  return campaign.effectiveStatus === 'ACTIVE' || campaign.status === 'ACTIVE';
}

function getStatusClassName(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();

  if (normalized === 'ACTIVE') {
    return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  }

  if (normalized.includes('PAUSED') || normalized === 'INACTIVE') {
    return 'border-amber-100 bg-amber-50 text-amber-700';
  }

  if (normalized.includes('REJECTED') || normalized.includes('DISAPPROVED') || normalized.includes('DELETED')) {
    return 'border-rose-100 bg-rose-50 text-rose-700';
  }

  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getBudgetLabel(campaign: MetaAdsManagedCampaign) {
  const budget = formatCurrency(campaign.budgetAllocated, campaign.currency);

  if (!campaign.budgetAllocatedType || budget === 'Not available') {
    return budget;
  }

  const typeLabel =
    campaign.budgetAllocatedType === 'spend_cap'
      ? 'spend cap'
      : campaign.budgetAllocatedType === 'adset'
        ? 'ad sets'
        : campaign.budgetAllocatedType;

  return `${budget} ${typeLabel}`;
}

function getSearchText(campaign: MetaAdsManagedCampaign) {
  return [
    campaign.name,
    campaign.objective,
    campaign.status,
    campaign.effectiveStatus,
    campaign.deliveryStatus,
    campaign.results?.label,
    ...campaign.ads.flatMap((ad) => [ad.name, ad.status, ad.effectiveStatus, ad.adsetName, ad.creativeName]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function ToggleSwitch({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-[#1381FF]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CampaignDetailsModal({
  campaign,
  onClose,
}: {
  campaign: MetaAdsManagedCampaign;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/40 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Campaign Details</p>
            <h2 className="mt-2 truncate text-2xl font-bold text-gray-900">{campaign.name || campaign.id}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatMetaLabel(campaign.objective)} • {campaign.ads.length} ads fetched
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close campaign details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-98px)] overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Delivery', formatMetaLabel(campaign.deliveryStatus), campaign.deliveryStatus],
              ['Configured Status', formatMetaLabel(campaign.status), campaign.status],
              ['Results', campaign.results ? `${formatCompactNumber(campaign.results.value)} ${campaign.results.label}` : 'Not available', null],
              ['Budget Spent', formatCurrency(campaign.budgetSpent, campaign.currency), null],
              ['Budget Allotted', getBudgetLabel(campaign), null],
              ['Impressions', formatCompactNumber(campaign.impressions), null],
              ['Reach', formatCompactNumber(campaign.reach), null],
              ['Clicks', formatCompactNumber(campaign.clicks), null],
            ].map(([label, value, status]) => (
              <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
                <p
                  className={`mt-2 text-sm font-semibold ${
                    status ? `inline-flex rounded-full border px-2.5 py-1 ${getStatusClassName(status)}` : 'text-gray-900'
                  }`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-base font-semibold text-gray-900">Schedule</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Starts</dt>
                  <dd className="text-right font-medium text-gray-900">{formatDateTime(campaign.startTime)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Ends</dt>
                  <dd className="text-right font-medium text-gray-900">{formatDateTime(campaign.stopTime)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Created</dt>
                  <dd className="text-right font-medium text-gray-900">{formatDateTime(campaign.createdTime)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Updated</dt>
                  <dd className="text-right font-medium text-gray-900">{formatDateTime(campaign.updatedTime)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-base font-semibold text-gray-900">Meta IDs</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Campaign ID</dt>
                  <dd className="text-right font-mono text-xs font-medium text-gray-900">{campaign.id}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Objective</dt>
                  <dd className="text-right font-medium text-gray-900">{formatMetaLabel(campaign.objective)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Currency</dt>
                  <dd className="text-right font-medium text-gray-900">{campaign.currency || 'Not available'}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Ad previews</h3>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {campaign.ads.length} ads
              </span>
            </div>

            {campaign.ads.length ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {campaign.ads.map((ad) => (
                  <div key={ad.id} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                      {ad.thumbnailUrl ? (
                        <img src={ad.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="px-3 text-center text-xs font-medium text-gray-400">No preview</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{ad.name || ad.id}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{ad.adsetName || 'No ad set returned'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${getStatusClassName(ad.effectiveStatus || ad.status)}`}>
                          {formatMetaLabel(ad.effectiveStatus || ad.status)}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-600">
                        {ad.previewText || ad.creativeName || 'Meta did not return preview text for this ad creative.'}
                      </p>
                      <p className="mt-3 font-mono text-[11px] text-gray-400">Ad ID: {ad.id}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Meta did not return ads under this campaign.
              </div>
            )}
          </div>

          <details className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-800">Raw campaign and insight data</summary>
            <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {JSON.stringify({ campaign: campaign.raw, insights: campaign.insightsRaw, ads: campaign.ads.map((ad) => ad.raw) }, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export default function MetaAdsManager() {
  const [period, setPeriod] = useState<MetaAdsCampaignPeriod>('last_30d');
  const [since, setSince] = useState(getDateOffset(-30));
  const [until, setUntil] = useState(getDateOffset(0));
  const [deliveryFilter, setDeliveryFilter] = useState<MetaAdsCampaignDeliveryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<MetaAdsCampaignsResponse | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<MetaAdsManagedCampaign | null>(null);
  const [updatingCampaignId, setUpdatingCampaignId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await appApi.getMetaAdsCampaigns({
        period,
        since: period === 'custom' ? since : undefined,
        until: period === 'custom' ? until : undefined,
      });
      setData(response);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load Meta ads.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, [period, since, until]);

  const filteredCampaigns = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return (data?.campaigns || []).filter((campaign) => {
      if (deliveryFilter === 'active' && !isCampaignDeliveryActive(campaign)) {
        return false;
      }

      if (deliveryFilter === 'inactive' && isCampaignDeliveryActive(campaign)) {
        return false;
      }

      return normalizedSearch ? getSearchText(campaign).includes(normalizedSearch) : true;
    });
  }, [data?.campaigns, deliveryFilter, searchQuery]);

  const handleToggleCampaign = async (campaign: MetaAdsManagedCampaign) => {
    const nextStatus = isCampaignActive(campaign) ? 'PAUSED' : 'ACTIVE';

    try {
      setUpdatingCampaignId(campaign.id);
      setError(null);
      const response = await appApi.updateMetaAdsCampaignStatus(campaign.id, { status: nextStatus });

      setData((current) => current
        ? {
            ...current,
            campaigns: current.campaigns.map((entry) =>
              entry.id === campaign.id
                ? {
                    ...entry,
                    status: response.status,
                    effectiveStatus: response.effectiveStatus,
                    deliveryStatus: response.effectiveStatus || response.status,
                  }
                : entry,
            ),
          }
        : current);

      setSelectedCampaign((current) =>
        current?.id === campaign.id
          ? {
              ...current,
              status: response.status,
              effectiveStatus: response.effectiveStatus,
              deliveryStatus: response.effectiveStatus || response.status,
            }
          : current,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update campaign status.');
    } finally {
      setUpdatingCampaignId(null);
    }
  };

  const connectedLabel = data?.config
    ? `${data.config.pageName || data.config.pageId || 'Facebook Page'} • ${data.config.adAccountName || data.config.adAccountId || 'Ad Account'}`
    : 'Connect from Connections';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ads Overview</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Search, filter, monitor, and manage campaigns fetched from your connected Meta Page and ad account.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-400">{connectedLabel}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/dashboard/connections?integration=meta-ads"
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Connection Settings
          </Link>
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1381FF] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_170px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search campaigns or ads"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
            />
          </label>

          <div className="relative block">
            <DropdownSelect
              value={period}
              onChange={(nextPeriod) => setPeriod(nextPeriod as MetaAdsCampaignPeriod)}
              options={PERIOD_OPTIONS}
              icon={<CalendarDays className="h-4 w-4" />}
              ariaLabel="Select campaign period"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 py-3 pl-4 pr-4 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />
          </div>

          <div className="relative block">
            <DropdownSelect
              value={deliveryFilter}
              onChange={(nextDeliveryFilter) => setDeliveryFilter(nextDeliveryFilter as MetaAdsCampaignDeliveryFilter)}
              options={DELIVERY_OPTIONS}
              icon={<Filter className="h-4 w-4" />}
              ariaLabel="Select campaign delivery filter"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 py-3 pl-4 pr-4 focus:border-[#1381FF] focus:ring-[#1381FF]/15"
            />
          </div>

          <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            {filteredCampaigns.length} shown
          </div>
        </div>

        {period === 'custom' ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">From</span>
              <input
                type="date"
                value={since}
                onChange={(event) => setSince(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">To</span>
              <input
                type="date"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#1381FF] focus:ring-1 focus:ring-[#1381FF]"
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#1381FF]" />
          </div>
        ) : filteredCampaigns.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">On/Off</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Campaign</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Objective</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Delivery Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Results</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Budget Allotted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Budget Spent</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="transition hover:bg-gray-50/80">
                    <td className="px-4 py-4 align-top">
                      <ToggleSwitch
                        checked={isCampaignActive(campaign)}
                        disabled={updatingCampaignId === campaign.id}
                        onClick={() => void handleToggleCampaign(campaign)}
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="max-w-[260px] truncate text-sm font-semibold text-gray-900">{campaign.name || campaign.id}</p>
                      <p className="mt-1 text-xs text-gray-500">{campaign.ads.length} ads fetched</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-gray-700">{formatMetaLabel(campaign.objective)}</td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClassName(campaign.deliveryStatus)}`}>
                        {formatMetaLabel(campaign.deliveryStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {campaign.results ? (
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatCompactNumber(campaign.results.value)}</p>
                          <p className="mt-1 text-xs text-gray-500">{campaign.results.label}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not available</span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm font-medium text-gray-900">{getBudgetLabel(campaign)}</td>
                    <td className="px-4 py-4 align-top text-sm font-medium text-gray-900">
                      {formatCurrency(campaign.budgetSpent, campaign.currency)}
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCampaign(campaign)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4" />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <p className="text-base font-semibold text-gray-900">No campaigns found</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
              Adjust search or filters, or confirm the connected Meta ad account has campaigns available for this period.
            </p>
          </div>
        )}
      </div>

      {selectedCampaign ? (
        <CampaignDetailsModal campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
      ) : null}
    </div>
  );
}
