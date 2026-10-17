/**
 * Coexistence uses an already registered WhatsApp Business app number. This module
 * deliberately contains no register, PIN, verification-code, or deregister calls.
 */
export interface CoexistenceMetaRequestInput {
  accessToken: string;
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export type CoexistenceMetaRequest = <T>(input: CoexistenceMetaRequestInput) => Promise<T>;

export const requiredCoexistenceWebhookFields = [
  'messages', 'account_update', 'history', 'smb_app_state_sync', 'smb_message_echoes',
] as const;

export const COEXISTENCE_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;
export const COEXISTENCE_RECOVERY_INSTRUCTIONS =
  'Do not retry this once-only synchronization request. Check Meta support using the saved request ID. ' +
  'If a new synchronization is necessary, disconnect in WhatsApp Business app > Settings > Account > ' +
  'Business Platform > Disconnect Account, then complete Embedded Signup again.';

export type CoexistenceSyncStep = 'contacts' | 'history';
export type CoexistenceSyncStatus =
  'not_requested' | 'requested' | 'pending' | 'declined' | 'completed' | 'unknown' | 'failed' | 'expired';

export interface CoexistenceSyncRequestState {
  status: CoexistenceSyncStatus;
  requestedAt?: string;
  updatedAt?: string;
  requestId?: string;
  lastError?: string;
  progress?: number;
}

export interface CoexistenceSyncState {
  contacts: CoexistenceSyncRequestState;
  history: CoexistenceSyncRequestState;
}

/** Scope the store to one channel/phone and one persisted onboarding lifecycle.
 * claim MUST atomically change not_requested -> requested and durably commit
 * before returning true. Claims must never expire or reset on ordinary retries.
 * A crash between claim and HTTP response is an unknown outcome, not permission
 * to replay. settle MUST merge with fresh state (e.g. using metadata CAS), keeping
 * request IDs and terminal webhook outcomes via mergeCoexistenceSyncRequest.
 */
export interface CoexistenceSyncStore {
  read(): Promise<CoexistenceSyncState>;
  claim(step: CoexistenceSyncStep, requested: CoexistenceSyncRequestState): Promise<boolean>;
  settle(step: CoexistenceSyncStep, outcome: CoexistenceSyncRequestState): Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function identifier(value: unknown, label: string) {
  const result = text(value);
  if (!result || !/^\d+$/.test(result)) throw new Error(`A valid ${label} is required.`);
  return result;
}

export function readCoexistenceSyncRequest(value: unknown): CoexistenceSyncRequestState {
  if (!record(value)) return { status: value == null ? 'not_requested' : 'unknown' };
  const validStatuses: CoexistenceSyncStatus[] = [
    'not_requested', 'requested', 'pending', 'declined', 'completed', 'unknown', 'failed', 'expired',
  ];
  const rawStatus = value.status ?? value.state;
  // Do not let an unrecognized legacy state with request evidence become replayable.
  const hasRequestEvidence = Boolean(text(value.requestedAt) || text(value.requestId) || text(value.request_id));
  const status = validStatuses.includes(rawStatus as CoexistenceSyncStatus)
    ? rawStatus as CoexistenceSyncStatus : hasRequestEvidence || rawStatus != null ? 'unknown' : 'not_requested';
  return {
    status: status === 'not_requested' && hasRequestEvidence ? 'unknown' : status,
    ...(text(value.requestedAt) ? { requestedAt: text(value.requestedAt) } : {}),
    ...(text(value.updatedAt) ? { updatedAt: text(value.updatedAt) } : {}),
    ...(text(value.requestId ?? value.request_id) ? { requestId: text(value.requestId ?? value.request_id) } : {}),
    ...(text(value.lastError) ? { lastError: text(value.lastError) } : {}),
    ...(typeof value.progress === 'number' && Number.isFinite(value.progress)
      ? { progress: Math.max(0, Math.min(100, value.progress)) } : {}),
  };
}

/** Accepts metadata.coexistenceSync, a metadata object, or a channel row. */
export function readCoexistenceSyncState(value: unknown): CoexistenceSyncState {
  let source = record(value) ? value : {};
  if (record(source.metadata)) source = source.metadata;
  if (record(source.coexistenceSync)) source = source.coexistenceSync;
  return {
    contacts: readCoexistenceSyncRequest(source.contacts),
    history: readCoexistenceSyncRequest(source.history),
  };
}

/** API acknowledgments can arrive after webhooks. Preserve observed completion,
 * refusal, progress and the original support request ID when that happens.
 */
export function mergeCoexistenceSyncRequest(
  previous: CoexistenceSyncRequestState,
  outcome: CoexistenceSyncRequestState,
): CoexistenceSyncRequestState {
  const terminal = previous.status === 'completed' || previous.status === 'declined';
  const merged: CoexistenceSyncRequestState = {
    ...previous, ...outcome,
    status: terminal ? previous.status : outcome.status,
    ...(previous.requestedAt ? { requestedAt: previous.requestedAt } : {}),
    ...(previous.requestId ? { requestId: previous.requestId } : {}),
    ...(previous.progress !== undefined || outcome.progress !== undefined
      ? { progress: Math.max(previous.progress || 0, outcome.progress || 0) } : {}),
    ...(terminal && previous.lastError ? { lastError: previous.lastError } : {}),
  };
  if ((terminal && !previous.lastError) ||
      (!terminal && (outcome.status === 'pending' || outcome.status === 'completed') && !outcome.lastError)) {
    delete merged.lastError;
  }
  return merged;
}

export interface CoexistencePhone extends Record<string, unknown> {
  id: string;
  is_on_biz_app: true;
  platform_type: 'CLOUD_API';
}

/** Session logging may return only a WABA ID. Never pick an arbitrary phone. */
export async function resolveCoexistencePhone(args: {
  accessToken: string;
  wabaId: string;
  phoneNumberId?: string | null;
  metaRequest: CoexistenceMetaRequest;
}): Promise<CoexistencePhone> {
  const wabaId = identifier(args.wabaId, 'WhatsApp Business account ID');
  const requestedId = args.phoneNumberId ? identifier(args.phoneNumberId, 'phone number ID') : undefined;
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const page = await args.metaRequest<{
      data?: Array<{ id?: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
    }>({
      accessToken: args.accessToken, path: `${wabaId}/phone_numbers`,
      query: { fields: 'id', limit: 100, ...(after ? { after } : {}) },
    });
    if (!Array.isArray(page.data)) throw new Error('Meta did not return the WhatsApp account phone numbers.');
    for (const phone of page.data) {
      if (text(phone?.id) && /^\d+$/.test(phone.id!)) ids.add(phone.id!);
    }
    const next = page.paging?.next ? text(page.paging.cursors?.after) : undefined;
    if (page.paging?.next && (!next || cursors.has(next))) {
      throw new Error('Meta phone-number pagination could not be verified. Retry connecting the account.');
    }
    if (next) cursors.add(next);
    after = next;
  } while (after);

  if (requestedId && !ids.has(requestedId)) {
    throw new Error('The phone number returned by Meta does not belong to the selected WhatsApp Business account.');
  }
  const candidates: CoexistencePhone[] = [];
  for (const id of requestedId ? [requestedId] : ids) {
    const phone = await args.metaRequest<Record<string, unknown>>({
      accessToken: args.accessToken, path: id,
      query: { fields: 'id,is_on_biz_app,platform_type,display_phone_number,verified_name' },
    });
    if (text(phone.id) && phone.id !== id) throw new Error('Meta returned a different phone number than requested.');
    if (phone.is_on_biz_app === true && phone.platform_type === 'CLOUD_API') {
      candidates.push({ ...phone, id, is_on_biz_app: true, platform_type: 'CLOUD_API' });
    }
  }
  if (candidates.length > 1) {
    throw new Error('This WhatsApp account has multiple WhatsApp Business app numbers. Select the intended phone number explicitly before completing Coexistence signup.');
  }
  if (candidates.length !== 1) {
    throw new Error('Meta has not confirmed a phone number connected to both the WhatsApp Business app and Cloud API (is_on_biz_app=true, platform_type=CLOUD_API). Complete Coexistence signup first.');
  }
  return candidates[0];
}

export async function assertCoexistenceWebhookPrerequisites(args: {
  appId: string;
  appAccessToken: string;
  wabaSubscribed: boolean;
  metaRequest: CoexistenceMetaRequest;
}): Promise<string[]> {
  if (!args.wabaSubscribed) throw new Error('Subscribe this app to the customer WhatsApp Business account before requesting Coexistence synchronization.');
  const appId = identifier(args.appId, 'Meta app ID');
  const result = await args.metaRequest<{
    data?: Array<{ object?: string; active?: boolean; fields?: Array<string | { name?: string }> }>;
  }>({ accessToken: args.appAccessToken, path: `${appId}/subscriptions` });
  const subscription = result.data?.find((entry) => entry.object === 'whatsapp_business_account' && entry.active !== false);
  const fields = (subscription?.fields || []).map((field) => typeof field === 'string' ? field : field.name).filter((field): field is string => Boolean(field));
  const missing = requiredCoexistenceWebhookFields.filter((field) => !fields.includes(field));
  if (missing.length) {
    throw new Error(`Enable these WhatsApp webhook fields in the Meta App Dashboard before synchronization: ${missing.join(', ')}.`);
  }
  return fields;
}

function apiFailure(error: unknown): { status: 'failed' | 'unknown'; message: string } {
  const metaStatus = record(error) && typeof error.metaStatus === 'number' ? error.metaStatus : undefined;
  // A transport failure, timeout, invalid response or server error can follow an
  // accepted POST. No automatic retry is safe, including for an explicit refusal.
  return {
    status: metaStatus && metaStatus >= 400 && metaStatus < 500 ? 'failed' : 'unknown',
    message: 'Coexistence synchronization could not be confirmed. ' + COEXISTENCE_RECOVERY_INSTRUCTIONS,
  };
}

export async function initiateCoexistenceSync(args: {
  accessToken: string;
  phoneNumberId: string;
  onboardedAt: string;
  webhooksReady: boolean;
  store: CoexistenceSyncStore;
  metaRequest: CoexistenceMetaRequest;
  now?: () => number;
  requestTimeoutMs?: number;
}): Promise<CoexistenceSyncState> {
  const phoneNumberId = identifier(args.phoneNumberId, 'phone number ID');
  const startedAt = Date.parse(args.onboardedAt);
  const now = args.now || Date.now;
  if (!Number.isFinite(startedAt) || startedAt > now() + 60_000) {
    throw new Error('A valid original Coexistence onboarding time is required before synchronization.');
  }
  if (!args.webhooksReady) throw new Error('Coexistence webhooks must be confirmed before requesting contacts or history.');

  for (const step of ['contacts', 'history'] as const) {
    const state = readCoexistenceSyncState(await args.store.read());
    if (state[step].status !== 'not_requested') continue;
    const timestamp = new Date(now()).toISOString();
    if (now() - startedAt >= COEXISTENCE_SYNC_WINDOW_MS) {
      await args.store.settle(step, {
        status: 'expired', updatedAt: timestamp,
        lastError: 'The 24-hour Coexistence synchronization window has expired. ' + COEXISTENCE_RECOVERY_INSTRUCTIONS,
      });
      continue;
    }
    // History must follow a confirmed contacts POST, never overtake another
    // worker's in-flight or uncertain contacts request.
    if (step === 'history' && !['pending', 'completed'].includes(state.contacts.status)) break;
    if (!await args.store.claim(step, { status: 'requested', requestedAt: timestamp, updatedAt: timestamp })) continue;
    // Persisting the atomic claim can itself cross the deadline.
    if (now() - startedAt >= COEXISTENCE_SYNC_WINDOW_MS) {
      await args.store.settle(step, {
        status: 'expired', updatedAt: new Date(now()).toISOString(),
        lastError: 'The 24-hour Coexistence synchronization window has expired. ' + COEXISTENCE_RECOVERY_INSTRUCTIONS,
      });
      continue;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: CoexistenceSyncRequestState;
    try {
      const request = args.metaRequest<{ request_id?: string; messaging_product?: string }>({
        accessToken: args.accessToken, path: `${phoneNumberId}/smb_app_data`, method: 'POST',
        body: { messaging_product: 'whatsapp', sync_type: step === 'contacts' ? 'smb_app_state_sync' : 'history' },
      });
      const response = await Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Coexistence sync request timed out.')), args.requestTimeoutMs ?? 30_000);
        }),
      ]);
      const requestId = text(response?.request_id);
      if (!requestId) throw new Error('Meta did not return a synchronization request ID.');
      outcome = { status: 'pending', requestId, updatedAt: new Date(now()).toISOString() };
    } catch (error) {
      const failure = apiFailure(error);
      outcome = { status: failure.status, updatedAt: new Date(now()).toISOString(), lastError: failure.message };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    // A persistence failure is propagated. The durable claim still prevents a
    // replay; it must not be overwritten with a new empty onboarding state.
    await args.store.settle(step, outcome);
    if (outcome.status !== 'pending') break;
  }
  return readCoexistenceSyncState(await args.store.read());
}
