import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationFeed from '../../components/NotificationFeed';
import { appApi } from '../../lib/api';
import { getUnreadNotificationCount } from '../../lib/notifications';
import { useAppData } from '../../context/AppDataContext';
import type { UserNotification } from '../../lib/types';

type FilterMode = 'all' | 'unread';

export default function Notifications() {
  const { bootstrap, setBootstrap } = useAppData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const notifications = bootstrap?.notifications || [];
  const unreadCount = getUnreadNotificationCount(notifications);

  const filteredNotifications = useMemo(() => {
    return filter === 'unread'
      ? notifications.filter((notification) => !notification.isRead)
      : notifications;
  }, [filter, notifications]);

  const markReadLocally = (targetId?: string | null) => {
    setBootstrap((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notifications: current.notifications.map((notification) =>
          !targetId || notification.id === targetId
            ? {
                ...notification,
                isRead: true,
                readAt: notification.readAt || new Date().toISOString(),
              }
            : notification,
        ),
      };
    });
  };

  const handleSelect = async (notification: UserNotification) => {
    if (!notification.isRead) {
      markReadLocally(notification.id);
      void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
    }

    if (notification.targetPath) {
      navigate(notification.targetPath);
    }
  };

  const handleMarkRead = (notification: UserNotification) => {
    markReadLocally(notification.id);
    void appApi.markNotificationsRead({ notificationId: notification.id }).catch(() => undefined);
  };

  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAllRead(true);
      markReadLocally(null);
      await appApi.markNotificationsRead({ markAll: true });
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const filterOptions: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'unread', label: 'Unread', count: unreadCount },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="mx-auto max-w-6xl space-y-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Stay on top of template reviews, missed calls, new leads, and workspace activity in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={isMarkingAllRead || unreadCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="flex flex-col gap-3 border-y border-gray-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-2xl bg-gray-100 p-1">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                filter === option.value
                  ? 'bg-white text-gray-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {option.label} <span className="text-xs text-gray-400">({option.count})</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filteredNotifications.length}</span> notifications
        </p>
      </div>

      <NotificationFeed
        notifications={filteredNotifications}
        onSelect={handleSelect}
        onMarkRead={handleMarkRead}
        groupByDate
        emptyTitle="No notifications match this view"
        emptyDescription="Try switching filters or check back after new activity."
      />
    </motion.div>
  );
}
