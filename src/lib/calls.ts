import type {
  CallLog,
  WhatsAppCallDirection,
  WhatsAppCallSessionRecord,
  WhatsAppCallState,
} from './types';
import { formatContactIdentity, normalizeContactIdentity, normalizePhoneLike } from './phone';

function normalizeCallDirection(value: unknown): WhatsAppCallDirection {
  return value === 'incoming' ? 'incoming' : 'outgoing';
}

function normalizeCallState(value: unknown): WhatsAppCallState {
  switch (value) {
    case 'incoming':
    case 'dialing':
    case 'ringing':
    case 'connecting':
    case 'ongoing':
    case 'ending':
    case 'ended':
    case 'rejected':
    case 'missed':
    case 'failed':
      return value;
    default:
      return 'dialing';
  }
}

export function mapCallLogRecord(row: Record<string, unknown>): CallLog {
  return {
    id: String(row.id),
    callId: (row.call_id as string | null) || null,
    name: (row.name as string | null) || null,
    phone: formatContactIdentity(row.phone) || String(row.phone || ''),
    type:
      row.type === 'incoming' || row.type === 'outgoing' || row.type === 'missed'
        ? row.type
        : 'outgoing',
    createdAt: String(row.created_at || new Date().toISOString()),
    durationSeconds: Number(row.duration_seconds || 0),
  };
}

export function mapCallSessionRecord(row: Record<string, unknown>): WhatsAppCallSessionRecord {
  const contactWaId = normalizeContactIdentity(row.contact_wa_id);
  const displayPhone =
    formatContactIdentity(row.display_phone) ||
    (normalizePhoneLike(contactWaId) ? formatContactIdentity(contactWaId) : null);

  return {
    id: String(row.id),
    callId: String(row.call_id || ''),
    contactWaId,
    contactName: (row.contact_name as string | null) || null,
    displayPhone,
    direction: normalizeCallDirection(row.direction),
    state: normalizeCallState(row.state),
    startedAt: String(row.started_at || row.created_at || new Date().toISOString()),
    connectedAt: (row.connected_at as string | null) || null,
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    endedAt: (row.ended_at as string | null) || null,
    offerSdp: (row.offer_sdp as string | null) || null,
    answerSdp: (row.answer_sdp as string | null) || null,
    bizOpaqueCallbackData: (row.biz_opaque_callback_data as string | null) || null,
    lastEvent: (row.last_event as string | null) || null,
    raw: (row.raw as Record<string, unknown>) || {},
  };
}

export function upsertCallLog(current: CallLog[], nextLog: CallLog) {
  return [nextLog, ...current.filter((entry) => entry.id !== nextLog.id)].slice(0, 50);
}

export function removeCallSession(current: WhatsAppCallSessionRecord[], deletedId: string) {
  return current.filter((entry) => entry.id !== deletedId);
}

export function upsertCallSession(current: WhatsAppCallSessionRecord[], nextSession: WhatsAppCallSessionRecord) {
  return [nextSession, ...current.filter((entry) => entry.id !== nextSession.id)].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
