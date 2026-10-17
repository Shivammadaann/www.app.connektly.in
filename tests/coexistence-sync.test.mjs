import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['server/coexistence-sync.ts'], bundle: true, write: false,
  format: 'esm', platform: 'node',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {
  resolveCoexistencePhone, assertCoexistenceWebhookPrerequisites,
  requiredCoexistenceWebhookFields, initiateCoexistenceSync,
  readCoexistenceSyncState, mergeCoexistenceSyncRequest, COEXISTENCE_SYNC_WINDOW_MS,
} = api;

const onboardedAt = '2026-10-17T09:00:00.000Z';
const time = Date.parse(onboardedAt);
const clone = (value) => JSON.parse(JSON.stringify(value));
function store(initial) {
  let state = readCoexistenceSyncState(initial);
  return {
    claims: [], outcomes: [],
    read: async () => clone(state),
    async claim(step, requested) {
      // The real adapter performs this conditional write atomically in Postgres.
      if (state[step].status !== 'not_requested') return false;
      state[step] = clone(requested);
      this.claims.push(step);
      return true;
    },
    async settle(step, outcome) {
      state[step] = mergeCoexistenceSyncRequest(state[step], outcome);
      this.outcomes.push({ step, ...outcome });
    },
  };
}
function input(persistence, overrides = {}) {
  return {
    accessToken: 'secret-token', phoneNumberId: '456', onboardedAt,
    webhooksReady: true, store: persistence, now: () => time + 1000,
    metaRequest: async (request) => ({ request_id: `${request.body.sync_type}-request` }),
    ...overrides,
  };
}

test('WABA-only completion identifies one verified Coexistence phone across pages', async () => {
  const calls = [];
  const phone = await resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', metaRequest: async (request) => {
    calls.push(request);
    if (request.path === '123/phone_numbers') return request.query.after
      ? { data: [{ id: '456' }] }
      : { data: [{ id: '789' }], paging: { next: 'opaque-next', cursors: { after: 'cursor-2' } } };
    return { id: request.path, is_on_biz_app: request.path === '456', platform_type: 'CLOUD_API', display_phone_number: '+1 555' };
  } });
  assert.equal(phone.id, '456');
  assert.equal(phone.is_on_biz_app, true);
  assert.equal(calls[1].query.after, 'cursor-2');
  assert.ok(calls.every((call) => !call.method || call.method === 'GET'));
});

test('Ambiguous phones require selection; supplied IDs must belong to WABA', async () => {
  const metaRequest = async (request) => request.path.endsWith('/phone_numbers')
    ? { data: [{ id: '456' }, { id: '789' }] }
    : { id: request.path, is_on_biz_app: true, platform_type: 'CLOUD_API' };
  await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', metaRequest }), /multiple.*explicitly/);
  await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', phoneNumberId: '999', metaRequest }), /does not belong/);
  const selected = await resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', phoneNumberId: '789', metaRequest });
  assert.equal(selected.id, '789');
});

for (const phone of [
  { id: '456', is_on_biz_app: false, platform_type: 'CLOUD_API' },
  { id: '456', is_on_biz_app: 'true', platform_type: 'CLOUD_API' },
  { id: '456', is_on_biz_app: true, platform_type: 'ON_PREMISE' },
  { id: '456' },
]) {
  test(`Reject unverified phone state ${JSON.stringify(phone)}`, async () => {
    await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', metaRequest: async (request) =>
      request.path.endsWith('/phone_numbers') ? { data: [{ id: '456' }] } : phone }), /has not confirmed/);
  });
}

test('Unverifiable pagination, mismatched phone response and path injection fail closed', async () => {
  await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', metaRequest: async () =>
    ({ data: [{ id: '456' }], paging: { next: 'present', cursors: { after: 'same' } } }) }), /pagination/);
  await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '123', metaRequest: async (request) =>
    request.path.endsWith('/phone_numbers') ? { data: [{ id: '456' }] } : { id: '999', is_on_biz_app: true, platform_type: 'CLOUD_API' } }), /different phone/);
  await assert.rejects(resolveCoexistencePhone({ accessToken: 'token', wabaId: '../me', metaRequest: async () => assert.fail('No network') }), /valid/);
});

test('Validate both customer WABA subscription and app topic fields before sync', async () => {
  let calls = 0;
  const configuration = {
    appId: '123', appAccessToken: 'app-token', wabaSubscribed: true,
    metaRequest: async () => { calls++; return { data: [{ object: 'whatsapp_business_account', active: true, fields: requiredCoexistenceWebhookFields.map((name) => ({ name })) }] }; },
  };
  assert.deepEqual(await assertCoexistenceWebhookPrerequisites(configuration), requiredCoexistenceWebhookFields);
  await assert.rejects(assertCoexistenceWebhookPrerequisites({ ...configuration, wabaSubscribed: false }), /Subscribe this app/);
  assert.equal(calls, 1);
  await assert.rejects(assertCoexistenceWebhookPrerequisites({ ...configuration, metaRequest: async () => ({ data: [{ object: 'page', fields: requiredCoexistenceWebhookFields }] }) }), /history.*smb_app_state_sync.*smb_message_echoes/);
  await assert.rejects(assertCoexistenceWebhookPrerequisites({ ...configuration, metaRequest: async () => ({ data: [{ object: 'whatsapp_business_account', active: false, fields: requiredCoexistenceWebhookFields }] }) }), /Enable these/);
});

test('Contacts precede history and API acknowledgments are pending with retained request IDs', async () => {
  const persistence = store();
  const calls = [];
  const args = input(persistence, { metaRequest: async (request) => {
    const state = await persistence.read();
    const step = request.body.sync_type === 'history' ? 'history' : 'contacts';
    assert.equal(state[step].status, 'requested', 'Persist before calling Meta');
    calls.push(request);
    return { request_id: `support-${step}` };
  } });
  const state = await initiateCoexistenceSync(args);
  assert.deepEqual(calls.map((call) => call.body.sync_type), ['smb_app_state_sync', 'history']);
  assert.ok(calls.every((call) => call.path === '456/smb_app_data' && call.method === 'POST'));
  assert.equal(state.contacts.status, 'pending');
  assert.equal(state.history.status, 'pending');
  assert.equal(state.history.requestId, 'support-history');
  await initiateCoexistenceSync(args);
  assert.equal(calls.length, 2, 'An activation retry never repeats accepted requests');
});

test('Concurrent activation and retries atomically send each once-only request once', async () => {
  const persistence = store();
  const calls = [];
  let releaseContacts;
  const contactsResponse = new Promise((resolve) => { releaseContacts = resolve; });
  const args = input(persistence, { metaRequest: async (request) => {
    calls.push(request.body.sync_type);
    return request.body.sync_type === 'history' ? { request_id: 'history-request' } : contactsResponse;
  } });
  const first = initiateCoexistenceSync(args);
  for (let count = 0; count < 10 && !calls.length; count++) await Promise.resolve();
  await initiateCoexistenceSync(args);
  assert.deepEqual(calls, ['smb_app_state_sync'], 'Do not overtake an in-flight contacts request');
  releaseContacts({ request_id: 'contacts-request' });
  await first;
  await Promise.all([initiateCoexistenceSync(args), initiateCoexistenceSync(args)]);
  assert.deepEqual(calls, ['smb_app_state_sync', 'history']);
});

for (const [name, response, expected] of [
  ['transport failure', () => { throw new Error('network'); }, 'unknown'],
  ['server error', () => { throw Object.assign(new Error('server'), { metaStatus: 500 }); }, 'unknown'],
  ['Meta refusal', () => { throw Object.assign(new Error('bad input'), { metaStatus: 400 }); }, 'failed'],
  ['missing request ID', () => ({}), 'unknown'],
]) {
  test(`Never replay a contacts request after ${name}`, async () => {
    const persistence = store();
    let calls = 0;
    const args = input(persistence, { metaRequest: async () => { calls++; return response(); } });
    const state = await initiateCoexistenceSync(args);
    assert.equal(state.contacts.status, expected);
    assert.equal(state.history.status, 'not_requested');
    assert.match(state.contacts.lastError, /Do not retry/);
    await initiateCoexistenceSync(args);
    assert.equal(calls, 1);
  });
}

test('A timeout or abandoned durable claim never permits request replay', async () => {
  const persistence = store();
  let calls = 0;
  const args = input(persistence, { requestTimeoutMs: 1, metaRequest: async () => { calls++; return new Promise(() => {}); } });
  assert.equal((await initiateCoexistenceSync(args)).contacts.status, 'unknown');
  await initiateCoexistenceSync(args);
  assert.equal(calls, 1);
  const abandoned = store({ contacts: { status: 'requested', requestedAt: onboardedAt } });
  await initiateCoexistenceSync(input(abandoned, { metaRequest: async () => assert.fail('Do not replay after process crash') }));
});

test('History failure retains the accepted contacts request without replaying either', async () => {
  const persistence = store();
  const calls = [];
  const args = input(persistence, { metaRequest: async (request) => {
    calls.push(request.body.sync_type);
    if (request.body.sync_type === 'history') throw new Error('history network failure');
    return { request_id: 'contacts-request' };
  } });
  const state = await initiateCoexistenceSync(args);
  assert.equal(state.contacts.requestId, 'contacts-request');
  assert.equal(state.history.status, 'unknown');
  await initiateCoexistenceSync(args);
  assert.deepEqual(calls, ['smb_app_state_sync', 'history']);
});

test('Deadline and webhook prerequisites block unsafe synchronization before any HTTP call', async () => {
  const persistence = store();
  const request = async () => assert.fail('No calls permitted');
  const expired = await initiateCoexistenceSync(input(persistence, { now: () => time + COEXISTENCE_SYNC_WINDOW_MS, metaRequest: request }));
  assert.equal(expired.contacts.status, 'expired');
  assert.equal(expired.history.status, 'expired');
  await assert.rejects(initiateCoexistenceSync(input(store(), { webhooksReady: false, metaRequest: request })), /webhooks/);
  await assert.rejects(initiateCoexistenceSync(input(store(), { onboardedAt: 'invalid', metaRequest: request })), /original/);
  await assert.rejects(initiateCoexistenceSync(input(store(), { now: () => time - 120000, metaRequest: request })), /original/);
});

test('A slow durable claim cannot start synchronization after the deadline', async () => {
  const persistence = store();
  const claim = persistence.claim.bind(persistence);
  let currentTime = time + COEXISTENCE_SYNC_WINDOW_MS - 1;
  persistence.claim = async (...args) => {
    const claimed = await claim(...args);
    currentTime += 2;
    return claimed;
  };
  const state = await initiateCoexistenceSync(input(persistence, {
    now: () => currentTime, metaRequest: async () => assert.fail('No request after deadline'),
  }));
  assert.equal(state.contacts.status, 'expired');
  assert.equal(state.history.status, 'expired');
});

test('Deadline is checked again between sequential contacts and history requests', async () => {
  let currentTime = time + COEXISTENCE_SYNC_WINDOW_MS - 1;
  const persistence = store();
  const calls = [];
  const state = await initiateCoexistenceSync(input(persistence, { now: () => currentTime, metaRequest: async (request) => {
    calls.push(request.body.sync_type);
    currentTime += 2;
    return { request_id: 'contacts-request' };
  } }));
  assert.deepEqual(calls, ['smb_app_state_sync']);
  assert.equal(state.history.status, 'expired');
});

test('Persistence failure before or after HTTP leaves a non-replayable claim', async () => {
  let calls = 0;
  const args = input(store(), { metaRequest: async () => { calls++; return { request_id: 'id' }; } });
  args.store.claim = async () => { throw new Error('database unavailable'); };
  await assert.rejects(initiateCoexistenceSync(args), /database/);
  assert.equal(calls, 0);
  const persistence = store();
  const settle = persistence.settle;
  persistence.settle = async () => { throw new Error('database unavailable'); };
  const requestArgs = input(persistence, { metaRequest: args.metaRequest });
  await assert.rejects(initiateCoexistenceSync(requestArgs), /database/);
  persistence.settle = settle;
  await initiateCoexistenceSync(requestArgs);
  assert.equal(calls, 1, 'Claim remains persisted even when saving acknowledgment fails');
});

test('Webhook completion/decline cannot be overwritten by a late HTTP acknowledgment', () => {
  for (const status of ['completed', 'declined']) {
    const merged = mergeCoexistenceSyncRequest({ status, requestId: 'original-id', progress: 100 }, { status: 'pending', requestId: 'late-id', progress: 55 });
    assert.equal(merged.status, status);
    assert.equal(merged.requestId, 'original-id');
    assert.equal(merged.progress, 100);
  }
  const legacy = readCoexistenceSyncState({ metadata: { coexistenceSync: { contacts: { status: 'not_requested', request_id: 'already-sent' } } } });
  assert.equal(legacy.contacts.status, 'unknown');
  assert.equal(legacy.contacts.requestId, 'already-sent');
  assert.equal(readCoexistenceSyncState({ contacts: { state: 'accepted' } }).contacts.status, 'unknown');
  assert.equal(readCoexistenceSyncState({ contacts: 'pending' }).contacts.status, 'unknown');
  assert.equal(mergeCoexistenceSyncRequest({ status: 'completed' }, { status: 'unknown', lastError: 'late transport error' }).lastError, undefined);
  assert.equal(mergeCoexistenceSyncRequest({ status: 'unknown', lastError: 'unconfirmed' }, { status: 'completed' }).lastError, undefined);
});

test('History webhook refusal arriving before HTTP response remains declined with request ID', async () => {
  const persistence = store();
  const args = input(persistence, { metaRequest: async (request) => {
    if (request.body.sync_type === 'history') {
      await persistence.settle('history', { status: 'declined', lastError: 'The customer declined history sharing.' });
    }
    return { request_id: `${request.body.sync_type}-support-id` };
  } });
  const state = await initiateCoexistenceSync(args);
  assert.equal(state.history.status, 'declined');
  assert.equal(state.history.requestId, 'history-support-id');
  assert.equal(state.history.lastError, 'The customer declined history sharing.');
  await initiateCoexistenceSync(args);
  assert.deepEqual(persistence.claims, ['contacts', 'history']);
});
