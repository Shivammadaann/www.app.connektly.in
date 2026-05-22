import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Clock3,
  Filter,
  Info,
  MessageCircleReply,
  MessageSquare,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { isDefaultInboxInsightsFilters } from '../../lib/insights';
import { DropdownSelect } from '../ui/DropdownSelect';
import type {
  InboxInsightsChannel,
  InboxInsightsFilters,
  InboxInsightsPeriod,
  InboxInsightsResponse,
} from '../../lib/types';

const PERIOD_OPTIONS: Array<{ value: InboxInsightsPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const CHANNEL_OPTIONS: Array<{ value: InboxInsightsChannel; label: string }> = [
  { value: 'all', label: 'All channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'messenger', label: 'Messenger' },
];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRangeFromPeriod(period: Exclude<InboxInsightsPeriod, 'custom'>) {
  const end = new Date();
  const start = new Date(end);

  if (period === '7d') {
    start.setDate(end.getDate() - 6);
  } else if (period === '30d') {
    start.setDate(end.getDate() - 29);
  }

  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
  };
}

function formatMetricValue(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatLastUpdated(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTierLabel(value: string | null, total: number | null) {
  if (typeof total === 'number' && Number.isFinite(total)) {
    return `${formatMetricValue(total)} daily contacts`;
  }

  if (!value) {
    return 'Meta tier unavailable';
  }

  return value.replace(/_/g, ' ');
}

function formatQualityLabel(value: string | null) {
  if (!value) {
    return 'Quality unavailable';
  }

  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function getQualityAppearance(value: string | null) {
  const normalized = (value || '').trim().toLowerCase();

  if (normalized === 'high' || normalized === 'green') {
    return {
      iconClassName: 'text-emerald-500',
      badgeClassName: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    };
  }

  if (normalized === 'medium' || normalized === 'yellow') {
    return {
      iconClassName: 'text-amber-500',
      badgeClassName: 'bg-amber-50 text-amber-700 border border-amber-100',
    };
  }

  if (normalized === 'low' || normalized === 'red') {
    return {
      iconClassName: 'text-red-500',
      badgeClassName: 'bg-red-50 text-red-700 border border-red-100',
    };
  }

  return {
    iconClassName: 'text-sky-500',
    badgeClassName: 'bg-sky-50 text-sky-700 border border-sky-100',
  };
}

function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <LoadingBlock className="h-5 w-44" />
          <LoadingBlock className="mt-5 h-3 w-full" />
          <div className="mt-4 flex items-end justify-between">
            <LoadingBlock className="h-8 w-40" />
            <LoadingBlock className="h-4 w-32" />
          </div>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <LoadingBlock className="h-5 w-36" />
          <LoadingBlock className="mt-5 h-10 w-48" />
          <LoadingBlock className="mt-3 h-4 w-24" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <LoadingBlock className="h-36 w-full" />
        <LoadingBlock className="h-36 w-full" />
        <LoadingBlock className="h-36 w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <LoadingBlock className="h-32 w-full" />
        <LoadingBlock className="h-32 w-full" />
        <LoadingBlock className="h-32 w-full" />
      </div>
    </div>
  );
}

export default function InboxInsightsSection() {
  const {
    bootstrap,
    defaultInboxInsights,
    isDefaultInboxInsightsLoading,
    refreshDefaultInboxInsights,
  } = useAppData();
  const [period, setPeriod] = useState<InboxInsightsPeriod>('today');
  const [filters, setFilters] = useState<InboxInsightsFilters>(() => ({
    ...getDateRangeFromPeriod('today'),
    channel: 'all',
  }));
  const [insights, setInsights] = useState<InboxInsightsResponse | null>(defaultInboxInsights);
  const [isLoading, setIsLoading] = useState(() => !defaultInboxInsights);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (period === 'custom') {
      return;
    }

    setFilters((current) => ({
      ...current,
      ...getDateRangeFromPeriod(period),
    }));
  }, [period]);

  const isUsingDefaultFilters = useMemo(() => isDefaultInboxInsightsFilters(filters), [filters]);

  useEffect(() => {
    if (!isUsingDefaultFilters || !defaultInboxInsights) {
      return;
    }

    setInsights(defaultInboxInsights);
    setError(null);
    setIsLoading(false);
  }, [defaultInboxInsights, isUsingDefaultFilters]);

  useEffect(() => {
    let cancelled = false;

    const loadInsights = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = isUsingDefaultFilters
          ? await refreshDefaultInboxInsights()
          : await appApi.getInboxInsights(filters);

        if (!cancelled && response) {
          setInsights(response);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error ? requestError.message : 'Failed to load inbox insights.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    if (isUsingDefaultFilters && defaultInboxInsights) {
      setInsights(defaultInboxInsights);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (isUsingDefaultFilters && !bootstrap?.channel && !isDefaultInboxInsightsLoading) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void loadInsights();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrap?.channel,
    defaultInboxInsights,
    filters,
    isDefaultInboxInsightsLoading,
    isUsingDefaultFilters,
    refreshDefaultInboxInsights,
  ]);

  const limitProgress = useMemo(() => {
    if (!insights?.messagingLimit.total || insights.messagingLimit.total <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, (insights.messagingLimit.consumed / insights.messagingLimit.total) * 100),
    );
  }, [insights?.messagingLimit.consumed, insights?.messagingLimit.total]);

  const qualityAppearance = getQualityAppearance(insights?.messagingQuality || null);
  const activeChannelLabel =
    CHANNEL_OPTIONS.find((option) => option.value === filters.channel)?.label || 'All channels';

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Activity className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-5 text-2xl font-bold text-gray-900">Connect WhatsApp first</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500">
            Insights reads your live inbox activity and Meta status signals. Connect a WhatsApp
            Business number first so message analytics can populate.
          </p>
          <Link
            to="/onboarding/channel-connection"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#5b45ff]/30 transition hover:bg-[#4a35e8]"
          >
            Open channel setup <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Insights</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Track daily Meta messaging capacity, message quality, and the delivery funnel for sent
            and received conversations.
          </p>
        </div>

        {insights ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
            {`Last updated ${formatLastUpdated(insights.lastUpdatedAt)}`}
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="h-4 w-32 animate-pulse rounded-full bg-gray-200" />
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
              <Clock3 className="h-3.5 w-3.5" /> Period
            </span>
            <DropdownSelect
              value={period}
              onChange={(nextPeriod) => setPeriod(nextPeriod as InboxInsightsPeriod)}
              options={PERIOD_OPTIONS}
              ariaLabel="Select insights period"
              buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-700 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>

          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
              <CalendarDays className="h-3.5 w-3.5" /> Start date
            </span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => {
                setPeriod('custom');
                setFilters((current) => ({
                  ...current,
                  startDate: event.target.value,
                }));
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>

          <label className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
              <CalendarDays className="h-3.5 w-3.5" /> End date
            </span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => {
                setPeriod('custom');
                setFilters((current) => ({
                  ...current,
                  endDate: event.target.value,
                }));
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
              <Filter className="h-3.5 w-3.5" /> Channel
            </span>
            <DropdownSelect
              value={filters.channel}
              onChange={(nextChannel) =>
                setFilters((current) => ({
                  ...current,
                  channel: nextChannel as InboxInsightsChannel,
                }))
              }
              options={CHANNEL_OPTIONS}
              ariaLabel="Select insights channel"
              buttonClassName="rounded-xl border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-700 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {insights && !insights.isChannelSupported ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {activeChannelLabel} insights are not wired yet. Showing an empty state until that
          channel starts writing message records into the inbox pipeline.
        </div>
      ) : null}

      {isLoading && !insights ? (
        <InsightsSkeleton />
      ) : insights ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Send className="h-5 w-5 text-emerald-500" />
                    <span>Your daily Meta messaging limit</span>
                    <Info className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Based on unique contacts reached in the selected window. Channel filter:{' '}
                    {activeChannelLabel}.
                  </p>
                </div>
                <a
                  href="https://developers.facebook.com/docs/whatsapp/messaging-limits"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[#2563eb] hover:underline"
                >
                  What are limits?
                </a>
              </div>

              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                  style={{ width: `${limitProgress}%` }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold tracking-tight text-gray-900">
                    {formatMetricValue(insights.messagingLimit.consumed)}
                    <span className="text-gray-300">/</span>
                    <span>
                      {insights.messagingLimit.total
                        ? formatMetricValue(insights.messagingLimit.total)
                        : 'Unlimited'}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-gray-500">Unique contacts reached</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <p className="font-medium text-gray-900">
                    {formatTierLabel(insights.messagingLimit.tier, insights.messagingLimit.total)}
                  </p>
                  <p className="mt-1">Current messaging tier</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <ShieldCheck className={`h-5 w-5 ${qualityAppearance.iconClassName}`} />
                <span>Messaging quality</span>
                <Info className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
                {formatQualityLabel(insights.messagingQuality)}
              </p>
              <div
                className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${qualityAppearance.badgeClassName}`}
              >
                {formatQualityLabel(insights.messagingQuality)}
              </div>
            </motion.div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">
                Totals
              </p>
              <h3 className="mt-1 text-2xl font-bold text-gray-900">Sent, delivered, received</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Total sent</span>
                  <Send className="h-5 w-5 text-[#5b45ff]" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.totals.sent)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Outbound text, media, and template messages.
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Delivered</span>
                  <CheckCheck className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.totals.delivered)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Includes delivered and read webhook confirmations.
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Received</span>
                  <MessageSquare className="h-5 w-5 text-sky-500" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.totals.received)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Inbound customer messages captured in the inbox.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">
                Sent Message Outcomes
              </p>
              <h3 className="mt-1 text-2xl font-bold text-gray-900">Read, replied, failed</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Read</span>
                  <ShieldCheck className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.outcomes.read)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Outbound messages confirmed as read by Meta.
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Replied</span>
                  <MessageCircleReply className="h-5 w-5 text-violet-500" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.outcomes.replied)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Outbound messages whose next message in the thread was an inbound reply.
                </p>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Failed</span>
                  <TriangleAlert className="h-5 w-5 text-red-500" />
                </div>
                <p className="mt-4 text-4xl font-bold tracking-tight text-gray-900">
                  {formatMetricValue(insights.outcomes.failed)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Outbound messages marked as failed by the webhook status feed.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  How the numbers are interpreted
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Delivered includes read confirmations. Replied is derived from message order
                  inside a thread, so it represents outbound messages followed by an inbound
                  response.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <Info className="h-4 w-4 text-gray-400" />
                Live data source: inbox message records
              </div>
            </div>
          </div>
        </div>
      ) : (
        <InsightsSkeleton />
      )}
    </div>
  );
}
