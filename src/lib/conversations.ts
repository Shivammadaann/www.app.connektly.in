import type { ConversationMessage, ConversationThread } from './types';
import { normalizeConversationThreadStatus } from './lead-status';
import { formatContactIdentity, normalizeContactIdentity, normalizePhoneLike } from './phone';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeThreadStatus(value: unknown): ConversationThread['status'] {
  return normalizeConversationThreadStatus(value);
}

function normalizeThreadPriority(value: unknown): ConversationThread['priority'] {
  if (value === 'Low' || value === 'High') {
    return value;
  }

  return 'Medium';
}

function normalizeLabels(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeAttributes(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function looksLikeMessengerPsid(value: unknown) {
  const digitsOnly = normalizePhoneLike(value);
  return Boolean(digitsOnly && digitsOnly.length > 15);
}

function getThreadDisplayPhone(row: Record<string, unknown>, contactWaId: string) {
  const source = normalizeOptionalString(row.source)?.toLowerCase();
  const normalizedContactWaId = contactWaId.toLowerCase();

  if (
    source === 'messenger' ||
    normalizedContactWaId.startsWith('messenger:') ||
    (!source && looksLikeMessengerPsid(row.display_phone || row.contact_wa_id))
  ) {
    const value = normalizeOptionalString(row.display_phone) || normalizeOptionalString(row.contact_wa_id);
    const digitsOnly = normalizePhoneLike(value);

    if (digitsOnly && digitsOnly.length > 15) {
      return digitsOnly;
    }

    return (value?.startsWith('messenger:') ? value.slice('messenger:'.length) : value) || null;
  }

  if (source === 'instagram' || normalizedContactWaId.startsWith('instagram:')) {
    const value = normalizeOptionalString(row.display_phone) || normalizeOptionalString(row.contact_wa_id);
    return (value?.startsWith('instagram:') ? value.slice('instagram:'.length) : value) || null;
  }

  return (
    formatContactIdentity(row.display_phone) ||
    (normalizePhoneLike(contactWaId) ? formatContactIdentity(contactWaId) : null)
  );
}

function getTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortConversationThreads(threads: ConversationThread[]) {
  return [...threads].sort((left, right) => {
    const timeDiff = getTimestamp(right.lastMessageAt) - getTimestamp(left.lastMessageAt);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return right.id.localeCompare(left.id);
  });
}

function sortConversationMessages(messages: ConversationMessage[]) {
  return [...messages].sort((left, right) => {
    const timeDiff = getTimestamp(left.createdAt) - getTimestamp(right.createdAt);

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getConversationMessageClientTempId(message: ConversationMessage) {
  const value = message.raw.client_temp_id;
  return typeof value === 'string' ? value : null;
}

function hasSameMessageIdentity(left: ConversationMessage, right: ConversationMessage) {
  if (left.id === right.id) {
    return true;
  }

  if (left.waMessageId && right.waMessageId && left.waMessageId === right.waMessageId) {
    return true;
  }

  const leftClientTempId = getConversationMessageClientTempId(left);
  const rightClientTempId = getConversationMessageClientTempId(right);

  return Boolean(leftClientTempId && rightClientTempId && leftClientTempId === rightClientTempId);
}

export function mapConversationThreadRecord(row: Record<string, unknown>): ConversationThread {
  const contactWaId = normalizeContactIdentity(row.contact_wa_id) || String(row.contact_wa_id);
  const displayPhone = getThreadDisplayPhone(row, contactWaId);

  return {
    id: String(row.id),
    contactWaId,
    contactName: normalizeOptionalString(row.contact_name),
    displayPhone,
    email: normalizeOptionalString(row.email),
    source: normalizeOptionalString(row.source),
    remark: normalizeOptionalString(row.remark),
    attributes: normalizeAttributes(row.attributes),
    avatarUrl: normalizeOptionalString(row.avatar_url),
    status: normalizeThreadStatus(row.status),
    priority: normalizeThreadPriority(row.priority),
    labels: normalizeLabels(row.labels),
    marketingOptedOut: Boolean(row.marketing_opted_out),
    ownerName: normalizeOptionalString(row.owner_name),
    lastMessageText: normalizeOptionalString(row.last_message_text),
    lastMessageAt: normalizeOptionalString(row.last_message_at),
    unreadCount: Number(row.unread_count || 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapConversationMessageRecord(row: Record<string, unknown>): ConversationMessage {
  const direction = row.direction === 'inbound' ? 'inbound' : 'outbound';

  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    waMessageId: normalizeOptionalString(row.wa_message_id),
    direction,
    messageType: typeof row.message_type === 'string' ? row.message_type : 'text',
    body: normalizeOptionalString(row.body),
    senderName: normalizeOptionalString(row.sender_name),
    senderWaId:
      direction === 'inbound'
        ? formatContactIdentity(row.sender_wa_id) || normalizeOptionalString(row.sender_wa_id)
        : normalizeOptionalString(row.sender_wa_id),
    recipientWaId:
      direction === 'outbound'
        ? formatContactIdentity(row.recipient_wa_id) || normalizeOptionalString(row.recipient_wa_id)
        : normalizeOptionalString(row.recipient_wa_id),
    templateName: normalizeOptionalString(row.template_name),
    status: normalizeOptionalString(row.status),
    createdAt: String(row.created_at),
    raw:
      row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
        ? (row.raw as Record<string, unknown>)
        : {},
  };
}

export function upsertConversationThread(threads: ConversationThread[], thread: ConversationThread) {
  const normalizedThreadIdentity = normalizeContactIdentity(thread.contactWaId);
  const existingIndex = threads.findIndex((item) => {
    if (item.id === thread.id) {
      return true;
    }

    const normalizedExistingIdentity = normalizeContactIdentity(item.contactWaId);
    return Boolean(
      normalizedThreadIdentity &&
        normalizedExistingIdentity &&
        normalizedThreadIdentity === normalizedExistingIdentity,
    );
  });

  if (existingIndex === -1) {
    return sortConversationThreads([...threads, thread]);
  }

  const next = [...threads];
  next[existingIndex] = thread;
  return sortConversationThreads(next);
}

export function removeConversationThread(threads: ConversationThread[], threadId: string) {
  return threads.filter((thread) => thread.id !== threadId);
}

export function upsertConversationMessage(messages: ConversationMessage[], message: ConversationMessage) {
  const existingIndex = messages.findIndex((item) => item.id === message.id);

  if (existingIndex !== -1) {
    const next = [...messages];
    next[existingIndex] = message;
    return sortConversationMessages(next);
  }

  const clientTempId = getConversationMessageClientTempId(message);

  if (clientTempId) {
    const optimisticIndex = messages.findIndex(
      (item) => getConversationMessageClientTempId(item) === clientTempId,
    );

    if (optimisticIndex !== -1) {
      const next = [...messages];
      next[optimisticIndex] = message;
      return sortConversationMessages(next);
    }
  }

  return sortConversationMessages([...messages, message]);
}

export function replaceConversationMessage(
  messages: ConversationMessage[],
  targetId: string,
  message: ConversationMessage,
) {
  const existingIndex = messages.findIndex((item) => item.id === targetId);

  if (existingIndex === -1) {
    return upsertConversationMessage(messages, message);
  }

  const next = [...messages];
  next[existingIndex] = message;
  return sortConversationMessages(next);
}

export function removeConversationMessage(messages: ConversationMessage[], messageId: string) {
  return messages.filter((message) => message.id !== messageId);
}

export function mergeConversationMessages(
  currentMessages: ConversationMessage[],
  serverMessages: ConversationMessage[],
) {
  const merged = [...serverMessages];

  for (const message of currentMessages) {
    const isPendingOutbound = message.direction === 'outbound' && message.status === 'sending';

    if (!isPendingOutbound) {
      continue;
    }

    const alreadyPresent = merged.some((serverMessage) => hasSameMessageIdentity(serverMessage, message));

    if (!alreadyPresent) {
      merged.push(message);
    }
  }

  return sortConversationMessages(merged);
}
