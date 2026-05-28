import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Megaphone,
  MessageSquarePlus,
  Phone,
  Plug,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import ChannelBrandIcon from '../../components/ChannelBrandIcon';
import IntegrationBrandIcon from '../../components/IntegrationBrandIcon';
import { appApi } from '../../lib/api';
import { useAppData } from '../../context/AppDataContext';
import type {
  AutomationRule,
  EmailCampaign,
  MetaAdsManagedCampaign,
} from '../../lib/types';

type PerformanceTab = 'ads' | 'campaigns' | 'whatsapp';

const todayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
};

function isInsideRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime();
}

function formatPercentChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? '+100%' : '0%';
  }

  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function formatCurrency(value: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function Sparkline({ values }: { values: number[] }) {
  const maxValue = Math.max(...values, 1);

  return (
    <div className="flex h-8 items-end gap-1">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-1.5 rounded-full bg-[#1381FF]/25"
          style={{ height: `${Math.max(20, (value / maxValue) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
  changeTone,
  sparkline,
}: {
  label: string;
  value: string;
  change: string;
  changeTone?: 'good' | 'bad' | 'neutral';
  sparkline: number[];
}) {
  const toneClass =
    changeTone === 'bad'
      ? 'bg-rose-50 text-rose-700'
      : changeTone === 'good'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-gray-100 text-gray-600';

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <Sparkline values={sparkline} />
      </div>
      <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
        {change}
      </span>
    </div>
  );
}

export default function Home() {
  const { bootstrap } = useAppData();
  const [performanceTab, setPerformanceTab] = useState<PerformanceTab>('ads');
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<MetaAdsManagedCampaign[]>([]);

  useEffect(() => {
    let isCancelled = false;
    const { start } = todayRange();
    const today = start.toISOString().slice(0, 10);

    const loadHomeData = async () => {
      const [automationsResult, emailCampaignsResult, adsResult] = await Promise.allSettled([
        appApi.getAutomationRules(),
        appApi.getEmailCampaigns(),
        bootstrap?.adsIntegration?.status === 'ready'
          ? appApi.getMetaAdsCampaigns({ period: 'custom', since: today, until: today })
          : Promise.resolve(null),
      ]);

      if (isCancelled) return;

      if (automationsResult.status === 'fulfilled') {
        setAutomationRules(automationsResult.value.rules);
      }

      if (emailCampaignsResult.status === 'fulfilled') {
        setEmailCampaigns(emailCampaignsResult.value.campaigns);
      }

      if (adsResult.status === 'fulfilled' && adsResult.value) {
        setAdCampaigns(adsResult.value.campaigns);
      }

    };

    void loadHomeData();

    return () => {
      isCancelled = true;
    };
  }, [bootstrap?.adsIntegration?.status]);

  const { start: todayStart, end: todayEnd } = todayRange();
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  const conversations = bootstrap?.conversations || [];
  const notifications = bootstrap?.notifications || [];
  const callHistory = bootstrap?.callHistory || [];
  const profileName = bootstrap?.profile?.fullName || 'there';
  const conversationsToday = conversations.filter((thread) =>
    isInsideRange(thread.lastMessageAt || thread.createdAt, todayStart, todayEnd),
  ).length;
  const conversationsYesterday = conversations.filter((thread) =>
    isInsideRange(thread.lastMessageAt || thread.createdAt, yesterdayStart, todayStart),
  ).length;
  const newLeadsToday = conversations.filter((thread) => isInsideRange(thread.createdAt, todayStart, todayEnd)).length;
  const newLeadsYesterday = conversations.filter((thread) => isInsideRange(thread.createdAt, yesterdayStart, todayStart)).length;
  const repliesPending = conversations.reduce((total, thread) => total + (thread.unreadCount || 0), 0);
  const activeAdCampaigns = adCampaigns.filter((campaign) =>
    ['ACTIVE', 'IN_PROCESS'].includes((campaign.effectiveStatus || campaign.status || '').toUpperCase()),
  );
  const todaysAdSpend = adCampaigns.reduce((total, campaign) => total + (campaign.budgetSpent || 0), 0);
  const adCurrency = adCampaigns.find((campaign) => campaign.currency)?.currency || bootstrap?.adsIntegration?.currency || 'INR';
  const callsToday = callHistory.filter((call) => isInsideRange(call.createdAt, todayStart, todayEnd));
  const missedCallsToday = callsToday.filter((call) => call.type === 'missed').length;
  const unreadLeadCount = conversations.filter((thread) => thread.unreadCount > 0).length;
  const activeAutomations = automationRules.filter((rule) => rule.isEnabled);
  const lastTriggeredAutomation = [...automationRules]
    .filter((rule) => rule.lastTriggeredAt)
    .sort((left, right) => Date.parse(right.lastTriggeredAt || '') - Date.parse(left.lastTriggeredAt || ''))[0];
  const sentEmailCampaignsToday = emailCampaigns.filter((campaign) => isInsideRange(campaign.sentAt || campaign.createdAt, todayStart, todayEnd));
  const campaignNotificationsToday = notifications.filter((notification) =>
    ['campaign_sent', 'email_campaign_sent'].includes(notification.type) &&
    isInsideRange(notification.createdAt, todayStart, todayEnd),
  );
  const activeCampaignCount = activeAdCampaigns.length + sentEmailCampaignsToday.length + campaignNotificationsToday.length;

  const performance = useMemo(() => {
    const adClicks = adCampaigns.reduce((total, campaign) => total + (campaign.clicks || 0), 0);
    const adImpressions = adCampaigns.reduce((total, campaign) => total + (campaign.impressions || 0), 0);
    const ctr = adImpressions ? `${((adClicks / adImpressions) * 100).toFixed(1)}%` : '0%';
    const campaignReach = sentEmailCampaignsToday.reduce((total, campaign) => total + campaign.recipientCount, 0);
    const whatsappReplies = conversations.filter((thread) => thread.unreadCount > 0).length;

    return {
      ads: {
        metric: ctr,
        label: 'CTR today',
        status: activeAdCampaigns.length ? 'Active' : bootstrap?.adsIntegration ? 'Paused' : 'Not connected',
        graph: [2, 5, 4, 7, 6, 9, Math.max(3, adClicks || 3)],
      },
      campaigns: {
        metric: String(campaignReach || sentEmailCampaignsToday.length),
        label: campaignReach ? 'Recipients today' : 'Campaigns today',
        status: sentEmailCampaignsToday.length || campaignNotificationsToday.length ? 'Active' : 'Idle',
        graph: [1, 2, 3, 2, 4, 3, Math.max(2, sentEmailCampaignsToday.length + 1)],
      },
      whatsapp: {
        metric: String(whatsappReplies),
        label: 'Replies waiting',
        status: bootstrap?.channel ? 'Active' : 'Not connected',
        graph: [3, 4, 3, 6, 4, 5, Math.max(2, whatsappReplies)],
      },
    };
  }, [
    activeAdCampaigns.length,
    adCampaigns,
    bootstrap?.adsIntegration,
    bootstrap?.channel,
    campaignNotificationsToday.length,
    conversations,
    sentEmailCampaignsToday,
  ]);

  const selectedPerformance = performance[performanceTab];
  const integrations = [
    {
      label: 'WhatsApp',
      connected: Boolean(bootstrap?.channel),
      path: '/dashboard/connections?section=channels',
      icon: <ChannelBrandIcon channel="whatsapp" className="h-8 w-8" />,
    },
    {
      label: 'Instagram',
      connected: Boolean(bootstrap?.instagramChannel),
      path: '/dashboard/connections?section=channels',
      icon: <ChannelBrandIcon channel="instagram" className="h-8 w-8" />,
    },
    {
      label: 'Meta Ads',
      connected: bootstrap?.adsIntegration?.status === 'ready',
      path: '/dashboard/ads/manager',
      icon: <IntegrationBrandIcon brand="ads" className="h-8 w-8" />,
    },
  ];

  const insights = [
    repliesPending > 0
      ? {
          icon: TrendingUp,
          text: `You have ${repliesPending} pending ${repliesPending === 1 ? 'reply' : 'replies'} across ${unreadLeadCount} lead${unreadLeadCount === 1 ? '' : 's'}.`,
          tone: 'text-[#1381FF] bg-[#f3f0ff]',
        }
      : {
          icon: CheckCircle2,
          text: 'No pending replies right now. Inbox follow-up is clear.',
          tone: 'text-emerald-700 bg-emerald-50',
        },
    sentEmailCampaignsToday[0]
      ? {
          icon: Megaphone,
          text: `Best recent campaign: ${sentEmailCampaignsToday[0].campaignName}.`,
          tone: 'text-blue-700 bg-blue-50',
        }
      : {
          icon: Sparkles,
          text: 'Create one focused campaign today to keep your audience warm.',
          tone: 'text-amber-700 bg-amber-50',
        },
    conversationsToday < conversationsYesterday
      ? {
          icon: TrendingDown,
          text: `Conversations dropped ${Math.abs(Number(formatPercentChange(conversationsToday, conversationsYesterday).replace('%', '')))}% today.`,
          tone: 'text-rose-700 bg-rose-50',
        }
      : {
          icon: TrendingUp,
          text: `Conversations are ${formatPercentChange(conversationsToday, conversationsYesterday)} versus yesterday.`,
          tone: 'text-emerald-700 bg-emerald-50',
        },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">Home</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Today Overview</h1>
          <p className="mt-1 text-sm text-gray-500">Welcome back, {profileName}. Here is what needs attention today.</p>
        </div>
        <Link
          to="/dashboard/inbox"
          className="inline-flex items-center gap-2 rounded-2xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8]"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Conversations Today"
          value={String(conversationsToday)}
          change={`${formatPercentChange(conversationsToday, conversationsYesterday)} vs yesterday`}
          changeTone={conversationsToday >= conversationsYesterday ? 'good' : 'bad'}
          sparkline={[conversationsYesterday, 2, 4, conversationsToday + 1, 3, 5, conversationsToday]}
        />
        <StatCard
          label="New Leads"
          value={String(newLeadsToday)}
          change={`${formatPercentChange(newLeadsToday, newLeadsYesterday)} vs yesterday`}
          changeTone={newLeadsToday >= newLeadsYesterday ? 'good' : 'bad'}
          sparkline={[newLeadsYesterday, 1, 3, 2, newLeadsToday + 1, 2, newLeadsToday]}
        />
        <StatCard
          label="Active Campaigns"
          value={String(activeCampaignCount)}
          change={activeCampaignCount ? 'Running now' : 'No active runs'}
          changeTone={activeCampaignCount ? 'good' : 'neutral'}
          sparkline={[1, 2, 1, activeCampaignCount + 1, 2, 3, activeCampaignCount]}
        />
        <StatCard
          label="Ad Spend Today"
          value={formatCurrency(todaysAdSpend, adCurrency)}
          change={bootstrap?.adsIntegration ? 'Synced today' : 'Connect ads'}
          changeTone={bootstrap?.adsIntegration ? 'neutral' : 'bad'}
          sparkline={[2, 3, 5, 4, 6, 4, Math.max(1, todaysAdSpend)]}
        />
        <StatCard
          label="Replies Pending"
          value={String(repliesPending)}
          change={repliesPending ? 'Needs attention' : 'Inbox clear'}
          changeTone={repliesPending ? 'bad' : 'good'}
          sparkline={[1, 3, repliesPending + 1, 2, 4, 3, repliesPending]}
        />
      </div>

      <div className="overflow-x-auto rounded-3xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-max gap-3">
          {[
            { label: 'New Chat', icon: MessageSquarePlus, path: '/dashboard/inbox' },
            { label: 'Create Campaign', icon: Megaphone, path: '/dashboard/campaigns' },
            { label: 'Create Template', icon: FileText, path: '/dashboard/templates' },
            { label: 'Run Ad', icon: Target, path: '/dashboard/ads/manager' },
            { label: 'Automation', icon: Zap, path: '/dashboard/automations' },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-[#d8d2ff] hover:bg-[#f6f4ff] hover:text-[#1381FF]"
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Performance Snapshot</h2>
              <p className="mt-1 text-sm text-gray-500">Simple signal across ads, campaigns, and WhatsApp.</p>
            </div>
            <div className="flex rounded-2xl bg-gray-100 p-1">
              {(['ads', 'campaigns', 'whatsapp'] as PerformanceTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPerformanceTab(tab)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium capitalize transition ${
                    performanceTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)_160px] md:items-center">
            <div>
              <p className="text-sm font-medium text-gray-500">{selectedPerformance.label}</p>
              <p className="mt-2 text-4xl font-bold text-gray-900">{selectedPerformance.metric}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-gray-50 px-5 py-6">
              <Sparkline values={selectedPerformance.graph} />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Status</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{selectedPerformance.status}</p>
            </div>
          </div>
        </motion.div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Connections Status</h2>
              <p className="mt-1 text-sm text-gray-500">Connection health at a glance.</p>
            </div>
            <Plug className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {integrations.map((integration) => (
              <Link
                key={integration.label}
                to={integration.path}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 transition hover:bg-white"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {integration.icon}
                  <span className="truncate text-sm font-semibold text-gray-900">{integration.label}</span>
                </span>
                {integration.connected ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#1381FF] ring-1 ring-gray-200">
                    Connect
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Automations Snapshot</h2>
            <Bot className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Active automations</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{activeAutomations.length}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Last triggered automation</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {lastTriggeredAutomation?.name || 'No automation triggered yet'}
              </p>
            </div>
            <Link to="/dashboard/automations" className="inline-flex items-center gap-1 text-sm font-medium text-[#1381FF]">
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Calls Snapshot</h2>
            <Phone className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Total calls today</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{callsToday.length}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Missed calls</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{missedCallsToday}</p>
            </div>
          </div>
          <Link
            to="/dashboard/calls"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/25 transition hover:bg-[#4a35e8]"
          >
            <Phone className="h-4 w-4" />
            Start Call
          </Link>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Smart Insights</h2>
            <Sparkles className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-5 space-y-3">
            {insights.map((insight, index) => (
              <div key={`${insight.text}-${index}`} className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${insight.tone}`}>
                  <insight.icon className="h-4 w-4" />
                </div>
                <p className="text-sm leading-6 text-gray-700">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
