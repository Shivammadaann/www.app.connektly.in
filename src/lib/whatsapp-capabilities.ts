import type { MetaChannelConnection } from './types';
import { isWhatsAppPartnerChannel } from './whatsapp-partner';

type WhatsAppChannel = Pick<MetaChannelConnection, 'setupType' | 'metadata'> | null | undefined;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Keep restrictions in place for existing/manual connections detected by Meta too. */
export function isWhatsAppCoexistence(channel: WhatsAppChannel): boolean {
  if (!channel) return false;
  const metadata = record(channel.metadata);
  const coexistence = record(metadata.coexistence);
  const phoneNumber = record(metadata.phoneNumber);
  return channel.setupType === 'coexistence'
    || coexistence.isOnBizApp === true
    || metadata.isOnBizApp === true
    || metadata.is_on_biz_app === true
    || phoneNumber.is_on_biz_app === true;
}

export const WHATSAPP_COEXISTENCE_DISCONNECT_GUIDANCE =
  'In the WhatsApp Business app, open Settings > Account > Business Platform > Disconnect Account. Connektly will update when Meta confirms the disconnection.';

export function getWhatsAppCoexistenceLifecycle(channel: WhatsAppChannel) {
  const lifecycle = record(record(record(channel?.metadata).coexistence).lifecycle);
  return {
    isReconnecting: isWhatsAppCoexistence(channel)
      && lifecycle.event === 'ACCOUNT_OFFBOARDED' && lifecycle.reconnecting !== false,
    event: typeof lifecycle.event === 'string' ? lifecycle.event : null,
  };
}

export function getWhatsAppCapabilities(channel: WhatsAppChannel) {
  const isCoexistence = isWhatsAppCoexistence(channel);
  const canManageCloudApiNumber = Boolean(channel) && !isCoexistence;
  const isPartner = isWhatsAppPartnerChannel(channel);
  return {
    isCoexistence,
    connectionLabel: isCoexistence ? 'WhatsApp Business app + Cloud API' : 'Cloud API',
    maxMessagesPerSecond: isCoexistence ? 20 : null,
    canRegisterSender: canManageCloudApiNumber && !isPartner,
    canDeregisterSender: canManageCloudApiNumber && !isPartner,
    canVerifyPhone: canManageCloudApiNumber && !isPartner,
    canManageTwoStepVerification: canManageCloudApiNumber && !isPartner,
    canEditBusinessProfile: canManageCloudApiNumber,
    canManageCommerceSettings: canManageCloudApiNumber,
    canUseCallingApi: canManageCloudApiNumber && !isWhatsAppPartnerChannel(channel),
  };
}

export type CoexistenceSyncStatus =
  | 'not_requested' | 'requested' | 'pending' | 'declined'
  | 'completed' | 'unknown' | 'failed' | 'expired';

const SYNC_STATUS_LABELS: Record<CoexistenceSyncStatus, string> = {
  not_requested: 'Not started',
  requested: 'Starting synchronization',
  pending: 'Waiting for Meta',
  declined: 'History sharing declined',
  completed: 'Complete',
  unknown: 'Confirmation unavailable',
  failed: 'Needs attention',
  expired: 'Setup window expired',
};

function syncOperation(value: unknown) {
  const operation = record(value);
  const rawStatus = operation.status ?? operation.state;
  const requestId = typeof (operation.requestId ?? operation.request_id) === 'string'
    ? String(operation.requestId ?? operation.request_id).trim() || null : null;
  const hasRequestEvidence = Boolean(requestId || (typeof operation.requestedAt === 'string' && operation.requestedAt.trim()));
  const parsedStatus: CoexistenceSyncStatus = typeof rawStatus === 'string'
    && Object.prototype.hasOwnProperty.call(SYNC_STATUS_LABELS, rawStatus)
    ? rawStatus as CoexistenceSyncStatus
    : rawStatus == null && !hasRequestEvidence ? 'not_requested' : 'unknown';
  const status = parsedStatus === 'not_requested' && hasRequestEvidence ? 'unknown' : parsedStatus;
  return {
    status,
    label: SYNC_STATUS_LABELS[status],
    progress: typeof operation.progress === 'number' && Number.isFinite(operation.progress)
      ? Math.min(100, Math.max(0, operation.progress)) : null,
    requestId,
    lastError: typeof operation.lastError === 'string' ? operation.lastError : null,
    needsRecovery: status === 'unknown' || status === 'failed' || status === 'expired',
  };
}

/** An accepted request is not a completed import; only webhook state completes it. */
export function getWhatsAppCoexistenceSync(channel: WhatsAppChannel) {
  if (!isWhatsAppCoexistence(channel)) return null;
  const sync = record(record(channel?.metadata).coexistenceSync);
  return {
    onboardedAt: typeof sync.onboardedAt === 'string' ? sync.onboardedAt : null,
    contacts: syncOperation(sync.contacts),
    history: syncOperation(sync.history),
  };
}
