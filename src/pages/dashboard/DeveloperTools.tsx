import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import type {
  WhatsAppBusinessAccountActivity,
  WhatsAppBusinessActivitiesFilters,
  WhatsAppBusinessActivitiesResponse,
  WhatsAppBusinessActivityType,
} from '../../lib/types';

const ACTIVITY_OPTIONS: Array<{ value: WhatsAppBusinessActivityType; label: string }> = [
  { value: 'ACCOUNT_CREATED', label: 'Account created' },
  { value: 'ACCOUNT_UPDATED', label: 'Account updated' },
  { value: 'ACCOUNT_DELETED', label: 'Account deleted' },
  { value: 'PHONE_NUMBER_ADDED', label: 'Phone number added' },
  { value: 'PHONE_NUMBER_REMOVED', label: 'Phone number removed' },
  { value: 'PHONE_NUMBER_VERIFIED', label: 'Phone number verified' },
  { value: 'USER_ADDED', label: 'User added' },
  { value: 'USER_REMOVED', label: 'User removed' },
  { value: 'USER_ROLE_CHANGED', label: 'User role changed' },
  { value: 'PERMISSION_GRANTED', label: 'Permission granted' },
  { value: 'PERMISSION_REVOKED', label: 'Permission revoked' },
  { value: 'TEMPLATE_CREATED', label: 'Template created' },
  { value: 'TEMPLATE_UPDATED', label: 'Template updated' },
  { value: 'TEMPLATE_DELETED', label: 'Template deleted' },
  { value: 'WEBHOOK_CONFIGURED', label: 'Webhook configured' },
  { value: 'API_ACCESS_GRANTED', label: 'API access granted' },
  { value: 'API_ACCESS_REVOKED', label: 'API access revoked' },
  { value: 'BILLING_UPDATED', label: 'Billing updated' },
  { value: 'COMPLIANCE_ACTION', label: 'Compliance action' },
  { value: 'SECURITY_EVENT', label: 'Security event' },
];

const DEFAULT_FILTERS: WhatsAppBusinessActivitiesFilters = {
  limit: 25,
  since: '',
  until: '',
  activityType: [],
};

const API_ACTIVITY_FILTERS: WhatsAppBusinessActivityType[] = [
  'API_ACCESS_GRANTED',
  'API_ACCESS_REVOKED',
  'PERMISSION_GRANTED',
  'PERMISSION_REVOKED',
];

const WEBHOOK_ACTIVITY_FILTERS: WhatsAppBusinessActivityType[] = ['WEBHOOK_CONFIGURED'];

function formatActivityLabel(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0) + segment.slice(1).toLowerCase())
    .join(' ');
}

function formatActorLabel(activity: WhatsAppBusinessAccountActivity) {
  if (activity.actorName) {
    return activity.actorName;
  }

  if (activity.actorId) {
    return activity.actorId;
  }

  return formatActivityLabel(activity.actorType);
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function summarizeDetails(details: Record<string, unknown> | null) {
  if (!details) {
    return 'No additional details';
  }

  const entries = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${formatActivityLabel(key)}: ${String(value)}`);

  return entries.length > 0 ? entries.join(' • ') : 'No additional details';
}

function getActivityTone(activityType: string) {
  const normalized = activityType.trim().toUpperCase();

  if (normalized.includes('SECURITY') || normalized.includes('COMPLIANCE')) {
    return 'border border-rose-100 bg-rose-50 text-rose-700';
  }

  if (normalized.includes('PERMISSION') || normalized.includes('API_ACCESS')) {
    return 'border border-sky-100 bg-sky-50 text-sky-700';
  }

  if (normalized.includes('TEMPLATE') || normalized.includes('WEBHOOK')) {
    return 'border border-violet-100 bg-violet-50 text-violet-700';
  }

  if (normalized.includes('PHONE_NUMBER')) {
    return 'border border-amber-100 bg-amber-50 text-amber-700';
  }

  return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
}

function getAuditSummary(activities: WhatsAppBusinessAccountActivity[]) {
  const uniqueActors = new Set<string>();
  let securityEvents = 0;
  let configChanges = 0;

  for (const activity of activities) {
    if (activity.actorId || activity.actorName) {
      uniqueActors.add(activity.actorId || activity.actorName || activity.id);
    }

    const type = activity.activityType.trim().toUpperCase();

    if (type.includes('SECURITY') || type.includes('COMPLIANCE')) {
      securityEvents += 1;
    }

    if (
      type.includes('ACCOUNT') ||
      type.includes('PHONE_NUMBER') ||
      type.includes('TEMPLATE') ||
      type.includes('WEBHOOK') ||
      type.includes('BILLING')
    ) {
      configChanges += 1;
    }
  }

  return {
    uniqueActors: uniqueActors.size,
    securityEvents,
    configChanges,
  };
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-3xl bg-slate-200/80" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-3xl bg-slate-200/80" />
      <div className="h-96 animate-pulse rounded-3xl bg-slate-200/80" />
    </div>
  );
}

export default function DeveloperTools() {
  const location = useLocation();
  const { bootstrap } = useAppData();
  const [filters, setFilters] = useState<WhatsAppBusinessActivitiesFilters>(DEFAULT_FILTERS);
  const [activitiesResponse, setActivitiesResponse] = useState<WhatsAppBusinessActivitiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const developerView = location.pathname.endsWith('/webhook') ? 'webhook' : 'api';
  const viewConfig =
    developerView === 'webhook'
      ? {
          badge: 'Webhook Tools',
          title: 'Webhook activity logs and audit trails',
          description:
            'Review webhook configuration changes, delivery-related platform events, and audit records for your connected WhatsApp Business Account.',
          emptyTitle: 'Webhook Tools',
        }
      : {
          badge: 'API Tools',
          title: 'API activity logs and audit trails',
          description:
            'Review API access changes, permission events, and audit records for your connected WhatsApp Business Account.',
          emptyTitle: 'API Tools',
        };

  useEffect(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      activityType:
        developerView === 'webhook' ? [...WEBHOOK_ACTIVITY_FILTERS] : [...API_ACTIVITY_FILTERS],
    });
  }, [developerView]);

  useEffect(() => {
    let cancelled = false;

    const loadActivities = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await appApi.getWhatsAppBusinessActivities(filters);

        if (!cancelled) {
          setActivitiesResponse(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load WhatsApp Business Account activity logs.',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    if (bootstrap?.channel) {
      void loadActivities();
    } else {
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [bootstrap?.channel, filters]);

  const activities = activitiesResponse?.activities || [];
  const summary = useMemo(() => getAuditSummary(activities), [activities]);

  const toggleActivityType = (value: WhatsAppBusinessActivityType) => {
    setFilters((current) => {
      const currentTypes = current.activityType || [];
      const nextTypes = currentTypes.includes(value)
        ? currentTypes.filter((entry) => entry !== value)
        : [...currentTypes, value];

      return {
        ...current,
        activityType: nextTypes,
        after: undefined,
        before: undefined,
      };
    });
  };

  const handleRefresh = () => {
    setFilters((current) => ({
      ...current,
    }));
  };

  if (!bootstrap?.channel) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Wrench className="mx-auto h-12 w-12 text-gray-300" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">{viewConfig.emptyTitle}</h1>
          <p className="mt-3 text-sm leading-7 text-gray-500">
            Connect a WhatsApp Business Account to view activity logs and audit trails.
          </p>
          <Link
            to="/dashboard/channels"
            className="mt-6 inline-flex items-center rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#4c38e0]"
          >
            Open channel setup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9d4ff] bg-[#f5f3ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#5b45ff]">
            <Activity className="h-3.5 w-3.5" />
            {viewConfig.badge}
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-gray-900">
            {viewConfig.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-500">
            {viewConfig.description}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <div className="font-medium text-gray-900">Connected WABA</div>
          <div className="mt-1 font-mono text-xs text-gray-500">
            {activitiesResponse?.wabaId || bootstrap.channel.wabaId}
          </div>
        </div>
      </div>

      <div className="rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <p className="mt-1 text-sm text-gray-500">
              Narrow the audit feed by date range, activity type, and page size.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Since
            </span>
            <input
              type="date"
              value={filters.since || ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  since: event.target.value,
                  after: undefined,
                  before: undefined,
                }))
              }
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Until
            </span>
            <input
              type="date"
              value={filters.until || ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  until: event.target.value,
                  after: undefined,
                  before: undefined,
                }))
              }
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            />
          </label>
          <div className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Records per page
            </span>
            <DropdownSelect
              value={String(filters.limit || 25)}
              onChange={(nextLimit) =>
                setFilters((current) => ({
                  ...current,
                  limit: Number(nextLimit),
                  after: undefined,
                  before: undefined,
                }))
              }
              options={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
              ariaLabel="Select records per page"
              buttonClassName="rounded-2xl border-gray-200 bg-gray-50 px-4 py-3 focus:border-[#5b45ff] focus:ring-[#5b45ff]/15"
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            Activity types
          </div>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_OPTIONS.map((option) => {
              const active = (filters.activityType || []).includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleActivityType(option.value)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    active
                      ? 'bg-[#5b45ff] text-white shadow-sm'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? <LoadingSkeleton /> : null}

      {!isLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Records on this page
              </div>
              <div className="mt-3 text-3xl font-semibold text-gray-900">{activities.length}</div>
              <div className="mt-2 text-sm text-gray-500">Chronological WhatsApp Business Account events returned by Meta.</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Unique actors
              </div>
              <div className="mt-3 text-3xl font-semibold text-gray-900">{summary.uniqueActors}</div>
              <div className="mt-2 text-sm text-gray-500">Admins, API clients, and system processes involved in the current window.</div>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Security and compliance events
              </div>
              <div className="mt-3 text-3xl font-semibold text-gray-900">{summary.securityEvents}</div>
              <div className="mt-2 text-sm text-gray-500">
                Combined count of security-sensitive and compliance-related events in this result set.
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Activity logs</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Event stream for account operations, administrative changes, and platform actions.
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
                  Updated {activitiesResponse ? formatTimestamp(activitiesResponse.fetchedAt) : 'just now'}
                </div>
              </div>

              {activities.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
                  <Clock3 className="mx-auto h-10 w-10 text-gray-300" />
                  <div className="mt-4 text-lg font-medium text-gray-900">No activities found</div>
                  <p className="mt-2 text-sm text-gray-500">
                    Try widening the date range or clearing the activity type filters.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {activities.map((activity) => (
                    <article
                      key={activity.id}
                      className="rounded-3xl border border-gray-200 bg-gray-50/70 p-5"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getActivityTone(activity.activityType)}`}
                            >
                              {formatActivityLabel(activity.activityType)}
                            </span>
                            <span className="text-xs text-gray-500">{formatTimestamp(activity.timestamp)}</span>
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-gray-900">
                            {activity.description || formatActivityLabel(activity.activityType)}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-gray-600">{summarizeDetails(activity.details)}</p>
                        </div>
                        <div className="grid shrink-0 gap-2 text-sm text-gray-500 sm:grid-cols-2 lg:w-[320px]">
                          <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Actor</div>
                            <div className="mt-1 font-medium text-gray-800">{formatActorLabel(activity)}</div>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Actor type</div>
                            <div className="mt-1 font-medium text-gray-800">{formatActivityLabel(activity.actorType)}</div>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[32px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#5b45ff]" />
                <h2 className="text-xl font-semibold text-gray-900">Audit trail</h2>
              </div>
              <p className="mt-2 text-sm leading-7 text-gray-500">
                Detailed records for compliance review, including actors, network source, user agent, and structured payload details.
              </p>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.16em] text-gray-500">
                      <th className="pb-3 pr-4 font-semibold">Time</th>
                      <th className="pb-3 pr-4 font-semibold">Action</th>
                      <th className="pb-3 pr-4 font-semibold">Actor</th>
                      <th className="pb-3 pr-4 font-semibold">Network</th>
                      <th className="pb-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activities.map((activity) => (
                      <tr key={activity.id} className="align-top">
                        <td className="py-4 pr-4 text-gray-600">{formatTimestamp(activity.timestamp)}</td>
                        <td className="py-4 pr-4">
                          <div className="font-medium text-gray-900">{formatActivityLabel(activity.activityType)}</div>
                          <div className="mt-1 text-xs text-gray-500">{activity.id}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="font-medium text-gray-900">{formatActorLabel(activity)}</div>
                          <div className="mt-1 text-xs text-gray-500">{formatActivityLabel(activity.actorType)}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-gray-900">{activity.ipAddress || 'Not available'}</div>
                          <div className="mt-1 line-clamp-2 max-w-xs text-xs text-gray-500">
                            {activity.userAgent || 'No user agent recorded'}
                          </div>
                        </td>
                        <td className="py-4">
                          <details className="group rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                            <summary className="cursor-pointer list-none text-sm font-medium text-[#5b45ff]">
                              View details
                            </summary>
                            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-gray-600">
                              {JSON.stringify(activity.details || {}, null, 2)}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-4 rounded-[32px] border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-500">
              Showing up to {filters.limit || 25} records from Meta for this result page.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!activitiesResponse?.paging.before}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    before: activitiesResponse?.paging.before || undefined,
                    after: undefined,
                  }))
                }
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={!activitiesResponse?.paging.after}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    after: activitiesResponse?.paging.after || undefined,
                    before: undefined,
                  }))
                }
                className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4c38e0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
