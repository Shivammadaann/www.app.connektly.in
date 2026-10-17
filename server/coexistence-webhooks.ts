/**
 * WhatsApp Business app coexistence webhooks are imports/mirrors, never new
 * inbound Cloud API events. Persistence adapters must not trigger notifications,
 * rules, unread counters or customer-service windows for these records.
 */
type RecordValue = Record<string, unknown>;

export type CoexistenceMessage = {
  id: string;
  contactWaId: string | null;
  direction: 'inbound' | 'outbound' | null;
  messageType: string;
  body: string | null;
  senderWaId: string | null;
  recipientWaId: string | null;
  createdAt: string | null;
  status: string | null;
  raw: RecordValue;
  source: 'whatsapp_business_app' | 'history';
  historical: boolean;
  mediaPlaceholder: boolean;
  hydrationOnly: boolean;
  suppressSideEffects: true;
  affectsCustomerServiceWindow: false;
  mutation?: {
    kind: 'edit' | 'revoke';
    originalMessageId: string;
    eventId: string;
    eventAt: string | null;
  };
};

export type CoexistenceContactChange = {
  contactWaId: string;
  action: 'add' | 'remove';
  fullName: string | null;
  firstName: string | null;
  changedAt: string | null;
  raw: RecordValue;
};

export type CoexistenceHistoryUpdate = {
  phase: number | null;
  chunkOrder: number | null;
  progress: number | null;
  sharingDeclined: boolean;
  errors: RecordValue[];
};

export type ParsedCoexistenceWebhook = {
  handled: boolean;
  messages: CoexistenceMessage[];
  contacts: CoexistenceContactChange[];
  historyUpdates: CoexistenceHistoryUpdate[];
  warnings: string[];
};

const record = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const phone = (value: unknown): string | null => {
  const text = string(value);
  // Group IDs, opaque identifiers and malformed values must not create CRM contacts.
  return text && /^\+?[\d\s().-]+$/.test(text) ? text.replace(/\D/g, '') || null : null;
};
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;

export function coexistenceTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 8.64e12) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function messagePreview(raw: RecordValue): string | null {
  const type = string(raw.type) || 'unknown';
  const content = record(raw[type]);
  if (type === 'text') return string(content.body);
  if (type === 'media_placeholder') return 'Media from WhatsApp Business app (not yet available)';
  if (type === 'revoke') return 'This message was deleted';
  if (type === 'image' || type === 'video' || type === 'document') {
    return string(content.caption) || string(content.filename) || `${type[0].toUpperCase()}${type.slice(1)} attachment`;
  }
  if (type === 'audio') return 'Audio attachment';
  if (type === 'sticker') return 'Sticker';
  if (type === 'contacts') return 'Contact card';
  if (type === 'location') return string(content.name) || 'Location';
  if (type === 'button') return string(content.text) || 'Button reply';
  if (type === 'interactive') {
    return string(record(content.body).text) || string(record(content.button_reply).title) ||
      string(record(content.list_reply).title) || string(record(content.nfm_reply).body) || 'Interactive message';
  }
  if (type === 'reaction') return string(content.emoji) || 'Reaction removed';
  return `${type} message`;
}

function historyStatus(value: unknown): string | null {
  const status = string(value)?.toLowerCase();
  return status === 'error' ? 'failed' : status || null;
}

function normalizeMessage(args: {
  value: unknown;
  businessPhone: string | null;
  threadPhone?: string | null;
  source: CoexistenceMessage['source'];
  hydrationOnly?: boolean;
  liveMutation?: boolean;
  warnings: string[];
}): CoexistenceMessage | null {
  const raw = record(args.value);
  const id = string(raw.id);
  if (!id) {
    args.warnings.push('Ignored coexistence message without a WhatsApp message ID.');
    return null;
  }
  const sender = phone(raw.from);
  const recipient = phone(raw.to);
  const threadPhone = phone(args.threadPhone);
  const isEcho = args.source === 'whatsapp_business_app' && !args.liveMutation;
  const historical = args.source === 'history';
  const hydrationOnly = Boolean(args.hydrationOnly);
  // Standalone history media messages do not reliably repeat original direction.
  // They must hydrate the stored wamid, or be queued until its thread arrives.
  const direction = hydrationOnly ? null : isEcho ? 'outbound' :
    historical && typeof record(raw.history_context).from_me === 'boolean' ? (record(raw.history_context).from_me ? 'outbound' : 'inbound') :
    sender && args.businessPhone && sender === args.businessPhone ? 'outbound' :
      sender && threadPhone && sender === threadPhone ? 'inbound' :
        recipient && threadPhone && recipient === threadPhone ? 'outbound' :
          sender && args.businessPhone && sender !== args.businessPhone ? 'inbound' : null;
  const contactWaId = threadPhone || (isEcho ? recipient :
    direction === 'outbound' ? recipient : sender !== args.businessPhone ? sender : recipient);
  const messageType = string(raw.type) || 'unknown';
  if (!hydrationOnly && (!contactWaId || !direction)) {
    args.warnings.push(`Ignored coexistence message ${id} with no unambiguous 1:1 contact or direction.`);
    return null;
  }
  const result: CoexistenceMessage = {
    id, contactWaId, direction, messageType, body: messagePreview(raw),
    senderWaId: sender, recipientWaId: recipient || (direction === 'inbound' ? args.businessPhone : threadPhone),
    createdAt: coexistenceTimestamp(raw.timestamp),
    status: historyStatus(record(raw.history_context).status) || (isEcho ? 'sent' : direction === 'inbound' ? 'received' : null),
    raw, source: args.source, historical, hydrationOnly,
    mediaPlaceholder: messageType === 'media_placeholder',
    suppressSideEffects: true, affectsCustomerServiceWindow: false,
  };
  if (messageType === 'edit' || messageType === 'revoke') {
    const mutation = record(raw[messageType]);
    const originalMessageId = string(mutation.original_message_id);
    if (!originalMessageId) {
      args.warnings.push(`Ignored ${messageType} event ${id} without original_message_id.`);
      return null;
    }
    result.mutation = { kind: messageType, originalMessageId, eventId: id, eventAt: result.createdAt };
    if (messageType === 'edit') result.body = messagePreview(record(mutation.message));
  }
  return result;
}

/** Parse one changes[] entry, after signature validation and tenant/channel lookup. */
export function parseCoexistenceWebhook(
  field: string | undefined,
  input: unknown,
  businessPhone?: string | null,
): ParsedCoexistenceWebhook {
  const value = record(input);
  const business = phone(record(value.metadata).display_phone_number) || phone(businessPhone);
  const result: ParsedCoexistenceWebhook = {
    handled: ['history', 'smb_app_state_sync', 'smb_message_echoes'].includes(field || ''),
    messages: [], contacts: [], historyUpdates: [], warnings: [],
  };
  const addMessage = (item: unknown, source: CoexistenceMessage['source'], threadPhone?: string | null, hydrationOnly = false, liveMutation = false) => {
    const normalized = normalizeMessage({ value: item, businessPhone: business, threadPhone, source, hydrationOnly, liveMutation, warnings: result.warnings });
    if (normalized) result.messages.push(normalized);
  };
  if (field === 'smb_message_echoes') {
    for (const item of array(value.message_echoes)) addMessage(item, 'whatsapp_business_app');
  } else if (field === 'history') {
    for (const history of array(value.history)) {
      const block = record(history);
      const metadata = record(block.metadata);
      const errors = array(block.errors).map(record).filter((error) => Object.keys(error).length > 0);
      result.historyUpdates.push({
        phase: integer(metadata.phase, 0, 2),
        chunkOrder: integer(metadata.chunk_order, 0),
        progress: integer(metadata.progress, 0, 100),
        sharingDeclined: errors.some((error) => Number(error.code) === 2593109), errors,
      });
      for (const thread of array(block.threads)) {
        const threadRecord = record(thread);
        const threadPhone = phone(threadRecord.id);
        if (!threadPhone) {
          result.warnings.push('Ignored history thread without a valid 1:1 contact phone number.');
          continue;
        }
        for (const message of array(threadRecord.messages)) addMessage(message, 'history', threadPhone);
      }
    }
    for (const message of array(value.messages)) addMessage(message, 'history', null, true);
  } else if (field === 'smb_app_state_sync') {
    for (const item of array(value.state_sync)) {
      const state = record(item);
      const contact = record(state.contact);
      const contactWaId = phone(contact.phone_number);
      if (state.type !== 'contact' || !contactWaId || !['add', 'remove'].includes(String(state.action))) continue;
      result.contacts.push({
        contactWaId, action: state.action as 'add' | 'remove',
        fullName: string(contact.full_name), firstName: string(contact.first_name),
        changedAt: coexistenceTimestamp(record(state.metadata).timestamp), raw: state,
      });
    }
  } else if (field === 'messages') {
    // An edit or deletion updates an existing record; it is never a fresh inbound
    // message, even though Meta delivers it under the ordinary messages field.
    for (const message of array(value.messages)) {
      if (['edit', 'revoke'].includes(String(record(message).type))) addMessage(message, 'whatsapp_business_app', null, false, true);
    }
  }
  return result;
}

function mergeStatus(previous: unknown, incoming: unknown): string | null {
  const oldStatus = string(previous)?.toLowerCase() || null;
  const nextStatus = string(incoming)?.toLowerCase() || null;
  if (!nextStatus) return oldStatus;
  if (!oldStatus) return nextStatus;
  const rank: Record<string, number> = { pending: 0, sent: 1, received: 1, delivered: 2, read: 3, played: 4 };
  // A replayed app/history snapshot cannot revive a failed send as pending or
  // sent. A later delivered/read/played observation is positive delivery proof.
  if (oldStatus === 'failed' && (rank[nextStatus] ?? 0) < 2) return oldStatus;
  if (rank[oldStatus] !== undefined && rank[nextStatus] !== undefined) return rank[nextStatus] > rank[oldStatus] ? nextStatus : oldStatus;
  if (nextStatus === 'failed' && (rank[oldStatus] || 0) >= 2) return oldStatus;
  return nextStatus;
}

/**
 * Returns a conversation_messages row/patch, preserving unrelated columns. Null
 * means an out-of-order media hydration or mutation must be persisted in a
 * durable pending queue and retried when its original wamid arrives.
 * Upsert by the database's unique (user_id, wa_message_id), never by arrival time.
 */
export function mergeCoexistenceMessage(
  existing: RecordValue | null | undefined,
  incoming: CoexistenceMessage,
): RecordValue | null {
  if (!existing && (incoming.hydrationOnly || incoming.mutation)) return null;
  if (!existing && (!incoming.direction || !incoming.contactWaId)) return null;
  const previous = existing || {};
  const previousRaw = record(previous.raw);
  const previousMeta = record(previousRaw.connektly_coexistence);
  const marker = {
    ...previousMeta,
    source: previousMeta.source || incoming.source,
    // A later history replay of a live inbound must not make it historical.
    historical: existing && previousMeta.historical !== true ? false : incoming.historical || previousMeta.historical === true,
    mediaPlaceholder: incoming.mediaPlaceholder,
    affectsCustomerServiceWindow: Boolean(existing) && previousMeta.historical !== true && previous.direction === 'inbound',
  };
  if (incoming.mutation) {
    const oldMutation = record(previousMeta.mutation);
    const oldTime = Date.parse(string(oldMutation.eventAt) || '');
    const nextTime = Date.parse(incoming.mutation.eventAt || '');
    if (oldMutation.kind === 'revoke' || (Number.isFinite(oldTime) && (!Number.isFinite(nextTime) || oldTime > nextTime))) return { ...previous };
    const edited = record(record(incoming.raw.edit).message);
    const revoked = incoming.mutation.kind === 'revoke';
    const nextRaw: RecordValue = revoked
      ? { ...previousRaw, type: 'revoke', revoke: incoming.raw.revoke }
      : { ...previousRaw, ...edited };
    // Revoked content must not remain rendered through the old type's payload.
    if (revoked && typeof previousRaw.type === 'string') delete nextRaw[previousRaw.type];
    return {
      ...previous,
      message_type: revoked ? 'revoke' : string(edited.type) || previous.message_type,
      body: revoked ? 'This message was deleted' : incoming.body,
      raw: { ...nextRaw, connektly_coexistence: { ...marker, mediaPlaceholder: false, mutation: incoming.mutation } },
    };
  }
  // Replayed placeholder chunks never erase a downloaded media payload or edit.
  const keepExistingContent = Boolean(existing) && (
    incoming.mediaPlaceholder && previous.message_type !== 'media_placeholder' ||
    Boolean(previousMeta.mutation)
  );
  const hydration = incoming.hydrationOnly;
  const nextRaw = keepExistingContent ? previousRaw : {
    ...previousRaw, ...incoming.raw,
    ...(hydration ? {
      from: previousRaw.from ?? incoming.raw.from,
      to: previousRaw.to ?? incoming.raw.to,
      timestamp: previousRaw.timestamp ?? incoming.raw.timestamp,
    } : {}),
  };
  const raw = {
    ...nextRaw,
    connektly_coexistence: {
      ...marker,
      mediaPlaceholder: keepExistingContent ? Boolean(previousMeta.mediaPlaceholder) : incoming.mediaPlaceholder,
    },
  };
  return {
    ...previous,
    wa_message_id: string(previous.wa_message_id) || incoming.id,
    direction: string(previous.direction) || incoming.direction,
    message_type: keepExistingContent ? previous.message_type : incoming.messageType,
    body: keepExistingContent ? previous.body : incoming.body,
    sender_wa_id: hydration ? previous.sender_wa_id : string(previous.sender_wa_id) || incoming.senderWaId,
    recipient_wa_id: hydration ? previous.recipient_wa_id : string(previous.recipient_wa_id) || incoming.recipientWaId,
    status: mergeStatus(previous.status, incoming.status),
    created_at: string(previous.created_at) || incoming.createdAt,
    raw,
  };
}

/** Monotonic history progress, safe for duplicate and out-of-order chunks. */
export function mergeCoexistenceHistoryState(previous: unknown, updates: CoexistenceHistoryUpdate[]): RecordValue {
  const state = record(previous);
  const chunks = new Set(array(state.receivedChunks).filter((item): item is string => typeof item === 'string'));
  let progress = integer(state.progress, 0, 100) || 0;
  let phase = integer(state.phase, 0, 2);
  let declined = state.sharingDeclined === true;
  const priorErrors = array(state.errors).map(record);
  const errors = new Map(priorErrors.map((error) => [JSON.stringify(error), error]));
  for (const update of updates) {
    if (update.progress !== null) progress = Math.max(progress, update.progress);
    if (update.phase !== null) phase = Math.max(phase ?? -1, update.phase);
    if (update.phase !== null && update.chunkOrder !== null) chunks.add(`${update.phase}:${update.chunkOrder}`);
    declined ||= update.sharingDeclined;
    for (const error of update.errors) errors.set(JSON.stringify(error), error);
  }
  const completed = progress === 100;
  return {
    ...state, progress, phase,
    receivedChunks: [...chunks].sort((a, b) => {
      const [ap, ac] = a.split(':').map(Number), [bp, bc] = b.split(':').map(Number);
      return ap - bp || ac - bc;
    }),
    sharingDeclined: declined,
    // Phase 2 alone does not imply overall completion; wait for progress=100.
    status: completed ? 'completed' : declined ? 'declined' : errors.size ? 'error' : 'syncing',
    errors: [...errors.values()],
  };
}

/** Only address-book provenance is changed. CRM names/tags/consent are separate. */
export function mergeCoexistenceContactAttributes(previous: unknown, change: CoexistenceContactChange): RecordValue {
  const attributes = record(previous);
  const old = record(attributes.whatsappBusinessAppContact);
  const oldTime = Date.parse(string(old.changedAt) || '');
  const nextTime = Date.parse(change.changedAt || '');
  if (Number.isFinite(oldTime) && (!Number.isFinite(nextTime) || nextTime < oldTime)) return { ...attributes };
  // At an equal timestamp deletion wins, making delivery order/replay harmless.
  if (old.action === 'remove' && change.action === 'add' && old.changedAt === change.changedAt) return { ...attributes };
  return {
    ...attributes,
    whatsappBusinessAppContact: {
      ...old,
      action: change.action,
      active: change.action === 'add',
      changedAt: change.changedAt,
      fullName: change.fullName || old.fullName || null,
      firstName: change.firstName || old.firstName || null,
    },
  };
}
