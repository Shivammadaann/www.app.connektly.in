import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['server/coexistence-sync-store.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { createCoexistenceSyncStore, mutateMetaChannelMetadata, mergeMetaChannelSaveMetadata, assertCoexistenceStorageReady } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const clone = (value) => JSON.parse(JSON.stringify(value));
const base = () => ({
  id: 'channel-1', user_id: 'user-1', setup_type: 'coexistence', status: 'pending',
  waba_id: '123', phone_number_id: '456',
  metadata: { coexistence: { isOnBizApp: true, lifecycle: { event: 'ONBOARDED' } }, coexistenceSync: {
    onboardingId: 'onboarding-1', onboardedAt: '2026-10-17T09:00:00.000Z',
    contacts: { status: 'not_requested' }, history: { status: 'not_requested' },
  } },
});

function database(initial = base()) {
  const db = { row: clone(initial), compares: [], beforeUpdate: null };
  db.from = () => {
    const conditions = [];
    let payload;
    const query = {
      select() { return this; }, update(value) { payload = value; return this; },
      eq(key, value) { conditions.push({ key, value }); return this; },
      is(key, value) { conditions.push({ key, value }); return this; },
      async maybeSingle() {
        if (!payload) return { data: clone(db.row), error: null };
        const metadataCondition = conditions.find(({ key }) => key === 'metadata');
        db.compares.push(metadataCondition?.value);
        db.beforeUpdate?.();
        const matches = conditions.every(({ key, value }) => key === 'metadata'
          ? JSON.stringify(db.row.metadata) === (value === null ? 'null' : value)
          : db.row[key] === value);
        if (!matches) return { data: null, error: null };
        Object.assign(db.row, clone(payload));
        return { data: clone(db.row), error: null };
      },
    };
    return query;
  };
  return db;
}

test('Real store atomically claims once across concurrent activation workers', async () => {
  const supabase = database();
  const args = { supabase, userId: 'user-1', channelId: 'channel-1', onboardingId: 'onboarding-1' };
  const first = createCoexistenceSyncStore(args);
  const second = createCoexistenceSyncStore(args);
  const claims = await Promise.all([first.claim('contacts', { status: 'requested' }), second.claim('contacts', { status: 'requested' })]);
  assert.deepEqual(claims.sort(), [false, true]);
  assert.ok(supabase.compares.every((value) => typeof value === 'string'), 'PostgREST gets JSON, never [object Object]');
  assert.equal((await first.read()).contacts.status, 'requested');
});

test('CAS retries merge fresh unrelated metadata and preserve observed terminal webhook state', async () => {
  const supabase = database();
  supabase.beforeUpdate = () => {
    supabase.beforeUpdate = null;
    supabase.row.metadata.anotherFeature = { changed: true };
    supabase.row.metadata.coexistenceSync.history = { status: 'declined', lastError: 'Customer chose not to share.' };
  };
  const persistence = createCoexistenceSyncStore({ supabase, userId: 'user-1', channelId: 'channel-1', onboardingId: 'onboarding-1' });
  await persistence.settle('history', { status: 'pending', requestId: 'support-request' });
  assert.equal(supabase.compares.length, 2);
  assert.deepEqual(supabase.row.metadata.anotherFeature, { changed: true });
  const state = await persistence.read();
  assert.equal(state.history.status, 'declined');
  assert.equal(state.history.requestId, 'support-request');
  assert.equal(state.history.lastError, 'Customer chose not to share.');
});

test('Bound store refuses changed phone lifecycle and disconnected accounts', async () => {
  for (const change of [
    (row) => { row.metadata.coexistenceSync.onboardingId = 'new-onboarding'; },
    (row) => { row.setup_type = 'exclusive'; },
    (row) => { row.status = 'disconnected'; },
    (row) => { row.metadata.coexistence.lifecycle.event = 'PARTNER_REMOVED'; },
  ]) {
    const supabase = database();
    change(supabase.row);
    const persistence = createCoexistenceSyncStore({ supabase, userId: 'user-1', channelId: 'channel-1', onboardingId: 'onboarding-1' });
    await assert.rejects(persistence.claim('contacts', { status: 'requested' }));
    assert.equal(supabase.compares.length, 0);
  }
});

test('Generic metadata CAS does not permit changing owner or phone identity', async () => {
  const supabase = database();
  await assert.rejects(mutateMetaChannelMetadata({ supabase, userId: 'user-1', channelId: 'channel-1', mutate: () => ({ phone_number_id: '999' }) }), /identity/);
  assert.equal(supabase.row.phone_number_id, '456');
});

function replacement(existingRow) {
  return {
    existingRow, setupType: 'coexistence', wabaId: '123', phoneNumberId: '456',
    metadataPatch: { coexistence: { isOnBizApp: true, lifecycle: { event: 'ONBOARDED', eventAt: '2026-10-17T10:00:00.000Z' } }, coexistenceSync: {
      onboardingId: 'new-onboarding', onboardedAt: '2026-10-17T10:00:00.000Z',
      contacts: { status: 'not_requested' }, history: { status: 'not_requested' },
    } },
  };
}

test('A new ticket alone cannot replay prior once-only sync on an active number', () => {
  const row = base();
  row.metadata.coexistenceSync.contacts = { status: 'pending', requestId: 'support-id' };
  row.metadata.coexistenceSync.history = { status: 'unknown', requestedAt: '2026-10-17T09:01:00Z' };
  const result = mergeMetaChannelSaveMetadata(replacement(row));
  assert.deepEqual(result.coexistenceSync, row.metadata.coexistenceSync);
  assert.deepEqual(result.coexistence.lifecycle, row.metadata.coexistence.lifecycle);
  assert.throws(() => mergeMetaChannelSaveMetadata({ ...replacement(row), setupType: 'exclusive' }), /Coexistence/);
});

test('Changing WABA or switching away and returning to a number cannot reset once-only claims', () => {
  const original = base();
  original.metadata.coexistenceSync.contacts = { status: 'pending', requestId: 'contacts-original' };
  original.metadata.coexistenceSync.history = { status: 'unknown', requestedAt: '2026-10-17T09:01:00Z' };
  const movedWaba = mergeMetaChannelSaveMetadata({ ...replacement(original), wabaId: '999' });
  assert.deepEqual(movedWaba.coexistenceSync, original.metadata.coexistenceSync);
  const switched = mergeMetaChannelSaveMetadata({ ...replacement(original), phoneNumberId: '789' });
  const differentPhone = { ...original, phone_number_id: '789', metadata: switched };
  const returned = mergeMetaChannelSaveMetadata(replacement(differentPhone));
  assert.deepEqual(returned.coexistenceSync, original.metadata.coexistenceSync);
  assert.equal(returned.coexistenceSyncByPhone['456'].sync.contacts.requestId, 'contacts-original');
  assert.ok(returned.coexistenceSyncByPhone['789']);
});

test('Temporary device offboarding/reconnection retains original lifecycle and requests', () => {
  for (const event of ['ACCOUNT_OFFBOARDED', 'ACCOUNT_RECONNECTED']) {
    const row = base();
    row.status = 'disconnected';
    row.metadata.coexistence.lifecycle = { event, offboardedAt: '2026-10-17T09:30:00Z' };
    row.metadata.coexistenceSync.history = { status: 'pending', requestId: 'original' };
    assert.deepEqual(mergeMetaChannelSaveMetadata(replacement(row)).coexistenceSync, row.metadata.coexistenceSync);
  }
});

test('Only Meta-confirmed partner removal plus a new ticket can start a new import lifecycle', () => {
  const row = base();
  row.metadata.coexistence.lifecycle = { event: 'PARTNER_REMOVED', partnerRemovedAt: '2026-10-17T09:30:00Z' };
  row.metadata.coexistenceSync.history = { status: 'completed', requestId: 'original' };
  const result = mergeMetaChannelSaveMetadata(replacement(row));
  assert.equal(result.coexistenceSync.onboardingId, 'new-onboarding');
  assert.equal(result.coexistenceSync.history.status, 'not_requested');
  assert.equal(result.coexistenceSyncHistory[0].history.requestId, 'original');
  const oldTicket = replacement(row);
  oldTicket.metadataPatch.coexistenceSync.onboardingId = 'onboarding-1';
  assert.throws(() => mergeMetaChannelSaveMetadata(oldTicket), /new Coexistence/);
  const predatesRemoval = replacement(row);
  predatesRemoval.metadataPatch.coexistenceSync.onboardedAt = '2026-10-17T09:15:00Z';
  assert.throws(() => mergeMetaChannelSaveMetadata(predatesRemoval), /predates/);
});

test('Queue table and worker RPC readiness are required before initiating once-only sync', async () => {
  const rpcCalls = [];
  const supabase = {
    from: (table) => ({ select: () => ({ limit: async () => { assert.equal(table, 'whatsapp_coexistence_webhook_jobs'); return { error: null }; } }) }),
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return { error: null, data: false }; },
  };
  await assertCoexistenceStorageReady(supabase, 'worker-uuid');
  assert.equal(rpcCalls[0].name, 'renew_whatsapp_coexistence_webhook_job');
  assert.equal(rpcCalls[0].args.p_job_id, '__connektly_activation_probe__');
  await assert.rejects(assertCoexistenceStorageReady({ ...supabase, rpc: async () => ({ error: new Error('missing function') }) }, 'worker'), /worker RPC/);
  await assert.rejects(assertCoexistenceStorageReady({ ...supabase, from: () => ({ select: () => ({ limit: async () => ({ error: 'missing table' }) }) }) }, 'worker'), /queue database migration/);
});
