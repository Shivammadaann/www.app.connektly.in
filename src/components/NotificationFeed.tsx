import { motion } from 'motion/react';
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  CheckCircle2,
  Megaphone,
  MessageSquare,
  PhoneMissed,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { UserNotification } from '../lib/types';

type NotificationTone = {
  icon: typeof Bell;
  iconClassName: string;
  iconBackgroundClassName: string;
  status: string;
};

type NormalizedNotification = {
  notification: UserNotification;
  type: UserNotification['type'];
  status: string;
  timestamp: string;
  isRead: boolean;
  tone: NotificationTone;
};

const listStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.035,
    },
  },
};

const listItemMotion = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  },
};

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'Just now';
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, secondsPerUnit] of ranges) {
    if (Math.abs(diffSeconds) >= secondsPerUnit) {
      return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }

  return formatter.format(diffSeconds, 'second');
}

function getNotificationTone(type: UserNotification['type']): NotificationTone {
  switch (type) {
    case 'incoming_message':
      return {
        icon: MessageSquare,
        iconClassName: 'text-blue-600',
        iconBackgroundClassName: 'bg-blue-50',
        status: 'Message',
      };
    case 'template_approved':
      return {
        icon: CheckCircle2,
        iconClassName: 'text-emerald-600',
        iconBackgroundClassName: 'bg-emerald-50',
        status: 'Approved',
      };
    case 'template_rejected':
      return {
        icon: XCircle,
        iconClassName: 'text-red-600',
        iconBackgroundClassName: 'bg-red-50',
        status: 'Rejected',
      };
    case 'missed_call':
      return {
        icon: PhoneMissed,
        iconClassName: 'text-amber-600',
        iconBackgroundClassName: 'bg-amber-50',
        status: 'Missed call',
      };
    case 'campaign_sent':
      return {
        icon: Megaphone,
        iconClassName: 'text-violet-600',
        iconBackgroundClassName: 'bg-violet-50',
        status: 'Campaign',
      };
    case 'display_name_approved':
      return {
        icon: BadgeCheck,
        iconClassName: 'text-green-600',
        iconBackgroundClassName: 'bg-green-50',
        status: 'Display name',
      };
    case 'display_name_rejected':
      return {
        icon: XCircle,
        iconClassName: 'text-red-600',
        iconBackgroundClassName: 'bg-red-50',
        status: 'Display name',
      };
    case 'team_member_joined':
      return {
        icon: UserPlus,
        iconClassName: 'text-sky-600',
        iconBackgroundClassName: 'bg-sky-50',
        status: 'Team',
      };
    default:
      return {
        icon: Bell,
        iconClassName: 'text-[#1381FF]',
        iconBackgroundClassName: 'bg-violet-50',
        status: 'Lead',
      };
  }
}

// Keep API-owned notification records unchanged; normalize only the display props shared by the page and bell dropdown.
function normalizeNotification(notification: UserNotification): NormalizedNotification {
  const tone = getNotificationTone(notification.type);

  return {
    notification,
    type: notification.type,
    status: tone.status,
    timestamp: notification.createdAt,
    isRead: notification.isRead,
    tone,
  };
}

function getDateGroupLabel(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return 'Earlier';
  }

  const date = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfNotificationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfNotificationDay) / 86_400_000);

  if (diffDays === 0) {
    return 'Today';
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return 'Earlier';
}

function groupNotifications(notifications: UserNotification[]) {
  const groups: Array<{ label: string; notifications: UserNotification[] }> = [];

  notifications.forEach((notification) => {
    const label = getDateGroupLabel(notification.createdAt);
    const existingGroup = groups.find((group) => group.label === label);

    if (existingGroup) {
      existingGroup.notifications.push(notification);
      return;
    }

    groups.push({ label, notifications: [notification] });
  });

  return groups;
}

function NotificationItem({
  notification,
  compact,
  onSelect,
  onMarkRead,
}: {
  key?: string;
  notification: UserNotification;
  compact: boolean;
  onSelect?: (notification: UserNotification) => void;
  onMarkRead?: (notification: UserNotification) => void;
}) {
  const normalized = normalizeNotification(notification);
  const Icon = normalized.tone.icon;
  const canSelect = Boolean(onSelect);

  return (
    <motion.div
      variants={listItemMotion}
      whileTap={canSelect ? { scale: 0.99 } : undefined}
      onClick={() => onSelect?.(notification)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && canSelect) {
          event.preventDefault();
          onSelect?.(notification);
        }
      }}
      role={canSelect ? 'button' : undefined}
      tabIndex={canSelect ? 0 : undefined}
      className={`group relative flex w-full items-start gap-3 px-4 text-left outline-none transition-colors duration-200 focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1381FF]/20 ${
        compact ? 'py-3' : 'py-3.5'
      } ${canSelect ? 'cursor-pointer' : 'cursor-default'} ${normalized.isRead ? 'bg-white hover:bg-gray-50' : 'bg-blue-50/45 hover:bg-blue-50/70'}`}
    >
      <span className={`mt-0.5 flex shrink-0 items-center justify-center rounded-xl ${compact ? 'h-8 w-8' : 'h-9 w-9'} ${normalized.tone.iconBackgroundClassName}`}>
        <Icon className={`h-4 w-4 ${normalized.tone.iconClassName}`} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {!normalized.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600 transition-opacity" /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className={`truncate font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-[15px]'}`}>{notification.title}</p>
              {!compact ? <span className="hidden shrink-0 text-xs text-gray-300 sm:inline">/</span> : null}
              {!compact ? <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{normalized.status}</span> : null}
            </div>
            <p className={`mt-0.5 line-clamp-2 text-gray-500 ${compact ? 'text-xs leading-5' : 'text-sm leading-5'}`}>{notification.body}</p>
            <p className="mt-1 text-[11px] font-medium text-gray-400">{formatRelativeTime(normalized.timestamp)}</p>
          </div>
        </div>
      </div>

      {onMarkRead && !normalized.isRead ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMarkRead(notification);
          }}
          className={`shrink-0 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 opacity-0 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 group-hover:opacity-100 group-focus-within:opacity-100 ${
            compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
          }`}
        >
          <span className="sr-only">Mark notification as read</span>
          {compact ? <CheckCheck className="h-3.5 w-3.5" /> : 'Mark read'}
        </button>
      ) : null}
    </motion.div>
  );
}

export default function NotificationFeed({
  notifications,
  onSelect,
  onMarkRead,
  compact = false,
  groupByDate = !compact,
  emptyTitle = 'No notifications yet',
  emptyDescription = 'New activity will appear here.',
  className = '',
}: {
  notifications: UserNotification[];
  onSelect?: (notification: UserNotification) => void;
  onMarkRead?: (notification: UserNotification) => void;
  compact?: boolean;
  groupByDate?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  if (notifications.length === 0) {
    return (
      <div className={`px-5 py-10 text-center ${compact ? 'bg-white' : 'rounded-3xl border border-dashed border-gray-200 bg-white'} ${className}`}>
        <Bell className="mx-auto h-8 w-8 text-gray-300" />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">{emptyTitle}</h3>
        <p className="mt-1 text-sm text-gray-500">{emptyDescription}</p>
      </div>
    );
  }

  const groups = groupByDate ? groupNotifications(notifications) : [{ label: '', notifications }];

  return (
    <motion.div
      variants={listStagger}
      initial="hidden"
      animate="visible"
      className={`${compact ? 'divide-y divide-gray-100 bg-white' : 'overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm'} ${className}`}
    >
      {groups.map((group) => (
        <div key={group.label || 'notifications'}>
          {groupByDate ? (
            <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              {group.label}
            </div>
          ) : null}
          <div className="divide-y divide-gray-100">
            {group.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                compact={compact}
                onSelect={onSelect}
                onMarkRead={onMarkRead}
              />
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}
