import {
  mergeCoexistenceSyncRequest, readCoexistenceSyncState,
  type CoexistenceSyncStore,
} from './coexistence-sync';

type Metadata = Record<string, unknown>;
type ChannelRow = Record<string, unknown>;
// Keep this adapter compatible with the existing service-role Supabase client.
interface MetadataDatabase { from(table: string): any }

export async function assertCoexistenceStorageReady(supabase: MetadataDatabase & {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error?: unknown }>;
}, workerId: string): Promise<void> {
  const table = await supabase.from('whatsapp_coexistence_webhook_jobs').select('id').limit(1);
  if (table.error) throw new Error('Deploy the Coexistence webhook queue database migration before starting synchronization. No synchronization request has been sent.');
  // Renew a job ID that cannot be created by the hash-based queue. This probes
  // RPC existence/permissions without claiming or disturbing any real job.
  const rpc = await supabase.rpc('renew_whatsapp_coexistence_webhook_job', {
    p_job_id: '__connektly_activation_probe__', p_worker_id: workerId, p_lease_seconds: 300,
  });
  if (rpc.error) throw new Error('The Coexistence webhook queue worker RPC is unavailable. Apply its database migration before starting synchronization. No synchronization request has been sent.');
}

function record(value: unknown): value is Metadata {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Preserve once-only request evidence when reconnecting the same active number.
 * A fresh encrypted ticket is necessary but insufficient to reset synchronization:
 * Meta must also have confirmed that the previous onboarding was disconnected.
 */
export function mergeMetaChannelSaveMetadata(args: {
  existingRow: ChannelRow | null;
  setupType: string;
  wabaId: string;
  phoneNumberId: string;
  metadataPatch?: Metadata;
}): Metadata {
  const existing = args.existingRow;
  const sameAssets = Boolean(existing && existing.waba_id === args.wabaId && existing.phone_number_id === args.phoneNumberId);
  const rawMetadata = record(existing?.metadata) ? existing.metadata : {};
  const registry = record(rawMetadata.coexistenceSyncByPhone) ? { ...rawMetadata.coexistenceSyncByPhone } : {};
  if (existing?.phone_number_id && record(rawMetadata.coexistenceSync)) {
    // The user currently has one active channel row. Switching numbers must not
    // erase once-only request evidence; preserve it without a history-length cap.
    registry[String(existing.phone_number_id)] = {
      wabaId: existing.waba_id,
      ...(typeof existing.display_phone_number === 'string' ? { displayPhoneNumber: existing.display_phone_number } : {}),
      coexistence: rawMetadata.coexistence || {}, sync: rawMetadata.coexistenceSync,
    };
  }
  const priorNumberValue = registry[args.phoneNumberId];
  const priorNumber = record(priorNumberValue) ? priorNumberValue : null;
  const restoringNumber = args.setupType === 'coexistence' && Boolean(priorNumber);
  const previous: Metadata = sameAssets ? rawMetadata : restoringNumber ? {
    coexistence: priorNumber!.coexistence, coexistenceSync: priorNumber!.sync,
  } : {};
  const patch = args.metadataPatch || {};
  const previousCoexistence = record(previous.coexistence) ? previous.coexistence : {};
  const lifecycle = record(previousCoexistence.lifecycle) ? previousCoexistence.lifecycle : {};
  const oldSync = record(previous.coexistenceSync) ? previous.coexistenceSync : {};
  const newSync = record(patch.coexistenceSync) ? patch.coexistenceSync : {};
  const offboardedAt = Date.parse(String(lifecycle.partnerRemovedAt || ''));
  const onboardedAt = Date.parse(String(oldSync.onboardedAt || ''));
  const offboarded = lifecycle.event === 'PARTNER_REMOVED'
    || (Number.isFinite(offboardedAt) && (!Number.isFinite(onboardedAt) || offboardedAt >= onboardedAt));
  if (sameAssets && (existing?.setup_type === 'coexistence' || previousCoexistence.isOnBizApp === true)
      && args.setupType !== 'coexistence' && !offboarded) {
    throw new Error('This number is connected through WhatsApp Business app Coexistence. Use the Coexistence connection flow.');
  }
  const result: Metadata = { ...previous, ...patch };
  if (Object.keys(registry).length) result.coexistenceSyncByPhone = registry;
  if (args.setupType !== 'coexistence' || (!sameAssets && !restoringNumber)) return result;
  const hasPreviousLifecycle = typeof oldSync.onboardingId === 'string';
  const sameLifecycle = hasPreviousLifecycle && oldSync.onboardingId === newSync.onboardingId;
  if (hasPreviousLifecycle && offboarded && sameLifecycle) {
    throw new Error('This signup ticket belongs to the disconnected onboarding. Complete a new Coexistence Embedded Signup flow.');
  }
  const reset = hasPreviousLifecycle && offboarded && !sameLifecycle && typeof newSync.onboardingId === 'string';
  if (reset) {
    const removedAt = Date.parse(String(lifecycle.partnerRemovedAt || lifecycle.eventAt || ''));
    const newOnboardedAt = Date.parse(String(newSync.onboardedAt || ''));
    if (!Number.isFinite(newOnboardedAt) || (Number.isFinite(removedAt) && newOnboardedAt < removedAt)) {
      throw new Error('This authorization predates the WhatsApp Business app disconnection. Complete a new Coexistence Embedded Signup flow.');
    }
    const history = Array.isArray(previous.coexistenceSyncHistory) ? previous.coexistenceSyncHistory : [];
    result.coexistenceSyncHistory = [...history, oldSync].slice(-5);
    return result;
  }
  if (hasPreviousLifecycle) {
    result.coexistenceSync = oldSync;
    // A reauthorization of an active number is not another onboarding event.
    result.coexistence = { ...previousCoexistence, ...(record(patch.coexistence) ? patch.coexistence : {}), lifecycle };
  } else if (record(previous.coexistenceSync)) {
    const oldState = readCoexistenceSyncState(oldSync);
    result.coexistenceSync = {
      ...newSync,
      contacts: oldState.contacts.status === 'not_requested' ? newSync.contacts : oldState.contacts,
      history: oldState.history.status === 'not_requested' ? newSync.history : oldState.history,
    };
  }
  return result;
}

/** Every mutation reads fresh metadata and atomically compares the entire JSONB
 * value. Retrying the local CAS is safe; it never repeats a Meta HTTP request.
 * Return null from mutate for an intentional no-op (e.g. a previously claimed
 * operation). Row IDs, owner, tokens and primary phone identifiers are immutable
 * through this helper. Writers must not perform external effects inside mutate.
 */
export async function mutateMetaChannelMetadata(args: {
  supabase: MetadataDatabase;
  userId: string;
  channelId: string;
  mutate: (metadata: Metadata, row: ChannelRow) => Record<string, unknown> | null;
  maxAttempts?: number;
}): Promise<ChannelRow> {
  for (let attempt = 0; attempt < (args.maxAttempts || 12); attempt++) {
    const current = await args.supabase.from('meta_channels').select('*')
      .eq('user_id', args.userId).eq('id', args.channelId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new Error('The WhatsApp connection no longer exists.');
    const row = current.data as ChannelRow;
    const metadata = record(row.metadata) ? row.metadata : {};
    const patch = args.mutate(metadata, row);
    if (!patch) return row;
    for (const protectedKey of ['id', 'user_id', 'waba_id', 'phone_number_id']) {
      if (protectedKey in patch && patch[protectedKey] !== row[protectedKey]) {
        throw new Error('A metadata update cannot change the WhatsApp connection identity.');
      }
    }
    const update = args.supabase.from('meta_channels').update({
      ...patch, updated_at: new Date().toISOString(),
    }).eq('user_id', args.userId).eq('id', args.channelId);
    // postgrest-js interpolates eq values; a plain object becomes [object Object].
    const conditional = row.metadata == null
      ? update.is('metadata', null)
      : update.eq('metadata', JSON.stringify(row.metadata));
    const saved = await conditional.select('*').maybeSingle();
    if (saved.error) throw saved.error;
    if (saved.data) return saved.data as ChannelRow;
  }
  throw new Error('The WhatsApp connection changed repeatedly. Retry the local activation check; synchronization requests will not be replayed.');
}

/** Patch only the feature's own metadata fields, preserving all other writers. */
export function patchMetaChannelMetadata(args: {
  supabase: MetadataDatabase;
  userId: string;
  channelId: string;
  metadataPatch: Metadata;
  rowPatch?: Metadata;
  expectedPhoneNumberId?: unknown;
  expectedWabaId?: unknown;
  cloudOnly?: boolean;
}) {
  return mutateMetaChannelMetadata({
    ...args,
    mutate: (metadata, row) => {
      const coexistence = record(metadata.coexistence) ? metadata.coexistence : {};
      if ((args.expectedPhoneNumberId !== undefined && row.phone_number_id !== args.expectedPhoneNumberId) ||
          (args.expectedWabaId !== undefined && row.waba_id !== args.expectedWabaId) ||
          row.status === 'disconnected') {
        throw new Error('The WhatsApp connection changed. Reload the channel before continuing.');
      }
      if (args.cloudOnly && (row.setup_type === 'coexistence' || coexistence.isOnBizApp === true || metadata.is_on_biz_app === true)) {
        throw new Error('Manage this number in the WhatsApp Business app. This operation is unavailable for Coexistence numbers.');
      }
      return { ...args.rowPatch, metadata: { ...metadata, ...args.metadataPatch } };
    },
  });
}

export function createCoexistenceSyncStore(args: {
  supabase: MetadataDatabase;
  userId: string;
  channelId: string;
  onboardingId: string;
  phoneNumberId?: string;
  wabaId?: string;
}): CoexistenceSyncStore {
  const assertLifecycle = (metadata: Metadata, row: ChannelRow) => {
    const sync = record(metadata.coexistenceSync) ? metadata.coexistenceSync : {};
    if (row.setup_type !== 'coexistence' || sync.onboardingId !== args.onboardingId ||
        (args.phoneNumberId !== undefined && row.phone_number_id !== args.phoneNumberId) ||
        (args.wabaId !== undefined && row.waba_id !== args.wabaId)) {
      throw new Error('The Coexistence onboarding session changed. Reload the channel before continuing.');
    }
    const coexistence = record(metadata.coexistence) ? metadata.coexistence : {};
    const lifecycle = record(coexistence.lifecycle) ? coexistence.lifecycle : {};
    if (row.status === 'disconnected' || ['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED'].includes(String(lifecycle.event))) {
      throw new Error('This WhatsApp Business app connection was disconnected. Complete Embedded Signup again.');
    }
    return sync;
  };
  return {
    async read() {
      const row = await mutateMetaChannelMetadata({ ...args, mutate: (metadata, row) => {
        assertLifecycle(metadata, row);
        return null;
      } });
      return readCoexistenceSyncState(row);
    },
    async claim(step, requested) {
      let claimed = false;
      await mutateMetaChannelMetadata({ ...args, mutate: (metadata, row) => {
        claimed = false;
        const sync = assertLifecycle(metadata, row);
        if (readCoexistenceSyncState(sync)[step].status !== 'not_requested') return null;
        claimed = true;
        return { metadata: { ...metadata, coexistenceSync: { ...sync, [step]: requested } } };
      } });
      return claimed;
    },
    async settle(step, outcome) {
      await mutateMetaChannelMetadata({ ...args, mutate: (metadata, row) => {
        const sync = assertLifecycle(metadata, row);
        return { metadata: { ...metadata, coexistenceSync: {
          ...sync, [step]: mergeCoexistenceSyncRequest(readCoexistenceSyncState(sync)[step], outcome),
        } } };
      } });
    },
  };
}
