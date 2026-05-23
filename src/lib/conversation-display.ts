import type { ConversationThread } from './types';
import { formatContactIdentity, normalizePhoneLike } from './phone';

export type ConversationDisplayChannel = 'whatsapp' | 'instagram' | 'messenger';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getThreadSource(thread: ConversationThread) {
  return thread.source?.trim().toLowerCase() || '';
}

function looksLikeMessengerPsid(value: unknown) {
  const digitsOnly = normalizePhoneLike(value);
  return Boolean(digitsOnly && digitsOnly.length > 15);
}

function isPlaceholderMessengerName(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  const normalized = value.trim();
  return (
    looksLikeMessengerPsid(normalized) ||
    normalized.toLowerCase().startsWith('messenger:') ||
    normalized.toLowerCase() === 'messenger user'
  );
}

export function getConversationDisplayChannel(thread: ConversationThread | null | undefined): ConversationDisplayChannel {
  const source = thread ? getThreadSource(thread) : '';
  const contactIdentity = thread?.contactWaId?.trim().toLowerCase() || '';

  if (
    source === 'messenger' ||
    contactIdentity.startsWith('messenger:') ||
    (!source && looksLikeMessengerPsid(thread?.displayPhone || thread?.contactWaId))
  ) {
    return 'messenger';
  }

  if (source === 'instagram' || contactIdentity.startsWith('instagram:')) {
    return 'instagram';
  }

  return 'whatsapp';
}

export function getConversationDisplayName(thread: ConversationThread | null | undefined) {
  if (!thread) {
    return 'Contact';
  }

  const channel = getConversationDisplayChannel(thread);
  const contactName = normalizeOptionalString(thread.contactName);
  const username = normalizeOptionalString(thread.username);

  if (channel === 'messenger') {
    return isPlaceholderMessengerName(contactName) ? username || 'Messenger User' : contactName;
  }

  if (channel === 'instagram') {
    return contactName || username || 'Instagram User';
  }

  return contactName || thread.displayPhone || formatContactIdentity(thread.contactWaId) || thread.contactWaId || 'Contact';
}

export function getConversationDisplayDetail(thread: ConversationThread | null | undefined) {
  if (!thread) {
    return '';
  }

  const channel = getConversationDisplayChannel(thread);

  if (channel === 'messenger') {
    return thread.username || (isPlaceholderMessengerName(thread.contactName)
      ? 'Profile unavailable from Meta'
      : thread.displayPhone || thread.contactWaId);
  }

  if (channel === 'instagram') {
    return thread.username || thread.contactName || '';
  }

  return thread.displayPhone || formatContactIdentity(thread.contactWaId) || thread.contactWaId || '';
}

export function getConversationInitial(thread: ConversationThread | null | undefined) {
  return getConversationDisplayName(thread).charAt(0).toUpperCase() || 'U';
}
