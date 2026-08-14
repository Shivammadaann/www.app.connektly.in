import type {
  NotificationPreferences,
  NotificationSoundPreset,
  NotificationType,
  UserNotification,
} from './types';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeNotificationType(value: unknown): NotificationType {
  switch (value) {
    case 'incoming_message':
    case 'template_approved':
    case 'template_rejected':
    case 'missed_call':
    case 'lead_created':
    case 'campaign_sent':
    case 'display_name_approved':
    case 'display_name_rejected':
    case 'team_member_joined':
      return value;
    default:
      return 'lead_created';
  }
}

function normalizeSoundPreset(value: unknown): NotificationSoundPreset {
  if (value === 'soft' || value === 'pulse') {
    return value;
  }

  return 'classic';
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeVolume(value: unknown, fallback = 0.8) {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Math.round(numericValue * 100) / 100));
}

function getTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortNotifications(notifications: UserNotification[]) {
  return [...notifications].sort((left, right) => {
    const timeDelta = getTimestamp(right.createdAt) - getTimestamp(left.createdAt);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

export function getDefaultNotificationPreferences(userId = ''): NotificationPreferences {
  const now = new Date().toISOString();

  return {
    userId,
    enabled: true,
    soundEnabled: true,
    callSoundEnabled: true,
    soundPreset: 'classic',
    volume: 0.8,
    incomingMessageEnabled: true,
    templateReviewEnabled: true,
    missedCallEnabled: true,
    leadEnabled: true,
    campaignSentEnabled: true,
    displayNameApprovedEnabled: true,
    teamJoinedEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function mapNotificationRecord(row: Record<string, unknown>): UserNotification {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    type: normalizeNotificationType(metadata.originalType || row.type),
    title: String(row.title || ''),
    body: String(row.body || ''),
    targetPath: normalizeOptionalString(row.target_path),
    isRead: Boolean(row.is_read),
    readAt: normalizeOptionalString(row.read_at),
    createdAt: String(row.created_at || new Date().toISOString()),
    metadata,
  };
}

export function mapNotificationPreferencesRecord(
  row: Record<string, unknown>,
): NotificationPreferences {
  const defaults = getDefaultNotificationPreferences(String(row.user_id || ''));

  return {
    userId: String(row.user_id || defaults.userId),
    enabled: normalizeBoolean(row.enabled, defaults.enabled),
    soundEnabled: normalizeBoolean(row.sound_enabled, defaults.soundEnabled),
    callSoundEnabled: normalizeBoolean(row.call_sound_enabled, defaults.callSoundEnabled),
    soundPreset: normalizeSoundPreset(row.sound_preset),
    volume: normalizeVolume(row.volume, defaults.volume),
    incomingMessageEnabled: normalizeBoolean(
      row.incoming_message_enabled,
      defaults.incomingMessageEnabled,
    ),
    templateReviewEnabled: normalizeBoolean(
      row.template_review_enabled,
      defaults.templateReviewEnabled,
    ),
    missedCallEnabled: normalizeBoolean(row.missed_call_enabled, defaults.missedCallEnabled),
    leadEnabled: normalizeBoolean(row.lead_enabled, defaults.leadEnabled),
    campaignSentEnabled: normalizeBoolean(
      row.campaign_sent_enabled,
      defaults.campaignSentEnabled,
    ),
    displayNameApprovedEnabled: normalizeBoolean(
      row.display_name_approved_enabled,
      defaults.displayNameApprovedEnabled,
    ),
    teamJoinedEnabled: normalizeBoolean(row.team_joined_enabled, defaults.teamJoinedEnabled),
    createdAt: String(row.created_at || defaults.createdAt),
    updatedAt: String(row.updated_at || defaults.updatedAt),
  };
}

export function upsertNotification(
  current: UserNotification[],
  nextNotification: UserNotification,
) {
  const next = [...current.filter((item) => item.id !== nextNotification.id), nextNotification];
  return sortNotifications(next);
}

export function removeNotification(current: UserNotification[], notificationId: string) {
  return current.filter((notification) => notification.id !== notificationId);
}

export function getUnreadNotificationCount(notifications: UserNotification[]) {
  return notifications.reduce((count, notification) => count + (notification.isRead ? 0 : 1), 0);
}
