import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { build, transform } from 'esbuild';
import ts from 'typescript';

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const provider = await load('server/gupshup.ts');
const partner = await load('src/lib/whatsapp-partner.ts');
const capabilities = await load('src/lib/whatsapp-capabilities.ts');
const ids = await load('src/lib/whatsapp-message-id.ts');
const sync = await load('server/coexistence-sync.ts');
const persistence = await load('server/coexistence-sync-store.ts');
const tickets = await load('server/embedded-signup-ticket.ts');
const queue = await load('server/coexistence-webhook-queue.ts');
const source = fs.readFileSync('server.ts', 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const clone = (value) => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const settings = { token: 'server-secret', partnerId: '4607', walletName: 'Connektly' };

test('hosting dashboard quotes and Bearer prefixes are normalized for both authentication header formats', async () => {
  const requests = [];
  const client = provider.createGupshupClient({ ...settings, token: '  "Bearer server-secret"  ', fetch: async (url, init) => {
    requests.push({ url, init });
    return url.endsWith('/partnerApps') ? json({ partnerAppsList: [], status: 'success' }) : json({ status: 'success', data: { appId: 'gs-app' } });
  } });
  assert.equal((await client.checkPartnerAuthentication()).authenticated, true);
  await client.createApp({ name: 'Connektly123', wabaId: '123', phone: '919123456' });
  assert.equal(requests[0].url, 'https://partner.gupshup.io/partner/account/api/partnerApps');
  assert.equal(requests[0].init.headers.Authorization, 'server-secret');
  assert.equal(requests[0].init.headers.token, undefined);
  assert.equal(requests[1].init.headers.Authorization, 'Bearer server-secret');
});

test('401 errors identify app lookup before creation and never echo provider response bodies or credentials', async () => {
  let requests = 0;
  const client = provider.createGupshupClient({ ...settings, fetch: async () => {
    requests++; return json({ status: 'error', message: 'sensitive-provider-response' }, 401);
  } });
  await assert.rejects(client.findApps('919123456'), (error) => {
    assert.equal(error.httpStatus, 401); assert.equal(error.operation, 'partner app lookup');
    assert.equal(provider.isRejectedGupshupAuthentication(error), true);
    assert.match(error.message, /App creation has not started/);
    assert.doesNotMatch(error.message, /sensitive-provider-response|server-secret|wallet/);
    return true;
  });
  assert.equal(requests, 1);
});

test('a hosting placeholder token fails before making a provider request', async () => {
  const client = provider.createGupshupClient({ ...settings, token: 'YOUR_UNIVERSAL_TOKEN', fetch: async () => { throw new Error('Must not contact the provider'); } });
  await assert.rejects(client.checkPartnerAuthentication(), /not configured/);
});

test('documented SDK creation binds partner wallet and never forces registration or replays a failed POST', async () => {
  const requests = [];
  const client = provider.createGupshupClient({ ...settings, fetch: async (url, init) => {
    requests.push({ url, init }); return json({ status: 'success', data: { appId: 'gs-app', subscriptionUrlSet: false } });
  } });
  assert.equal(await client.createApp({ name: 'Connektly123', wabaId: '123', phone: '+91 123-456' }), 'gs-app');
  assert.equal(requests[0].url, 'https://partner.gupshup.io/partner/bizgate/partner/4607/tpp/app');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer server-secret');
  assert.deepEqual(JSON.parse(requests[0].init.body), { name: 'Connektly123', wabaId: '123', phone: '91123456', walletName: 'Connektly', force: false });
  let calls = 0;
  const unavailable = provider.createGupshupClient({ ...settings, fetch: async () => { calls++; return new Response('<html>portal</html>', { headers: { 'Content-Type': 'text/html' } }); } });
  await assert.rejects(unavailable.createApp({ name: 'Connektly123', wabaId: '123', phone: '91123456' }), /non-JSON/);
  assert.equal(calls, 1);
});

test('provider app matching reconciles linked and filtered lists without duplicate or partial-phone matches', async () => {
  const client = provider.createGupshupClient({ ...settings, fetch: async (url) => url.endsWith('/partnerApps')
    ? json({ status: 'success', partnerAppsList: [{ id: 'linked-only', phone: '919123456' }, { id: 'exact', phone: '919123456' }, { id: 'sandbox' }] })
    : url.includes('/list?') ? json({ status: 'success', apps: [{ id: 'wrong', phone: '9191234560' }, { id: 'exact', phone: '+91 9123456' }] })
    : json({ status: 'success', app: 'true', appDetails: { id: 'exact', provider: 'OD' } }) });
  assert.deepEqual((await client.findApps('919123456')).map((a) => a.id), ['linked-only', 'exact']);
  assert.equal((await client.details('exact')).provider, 'OD');
});

test('partner readiness does not expose linked apps and rejects incomplete discovery responses', async () => {
  const client = provider.createGupshupClient({ ...settings, fetch: async () => json({
    status: 'success', partnerAppsList: [{ id: 'private-app', name: 'Private customer', phone: '919123456' }],
  }) });
  assert.deepEqual(Object.keys(await client.checkPartnerAuthentication()).sort(), ['authenticated', 'checkedAt']);
  for (const body of [{ status: 'success' }, { status: 'success', partnerAppsList: [{}] }]) {
    const invalid = provider.createGupshupClient({ ...settings, fetch: async () => json(body) });
    await assert.rejects(invalid.checkPartnerAuthentication(), /verifiable linked partner app list/);
    await assert.rejects(invalid.findApps('919123456'), /verifiable linked partner app list/);
  }
});

test('v3 subscription keeps other callbacks, subscribes delivery/account/coexistence modes, and verifies its auth header', async () => {
  let own = null;
  const calls = [];
  const unrelated = { id: 'other', tag: 'Other service', url: 'https://other.example/hook' };
  const client = provider.createGupshupClient({ ...settings, fetch: async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET') return json({ status: 'success', subscriptions: [unrelated, ...(own ? [own] : [])] });
    const form = new URLSearchParams(init.body);
    for (const mode of ['ALL', 'READ', 'DELIVERED', 'SENT', 'FAILED', 'BILLING', 'ACCOUNT', 'COEXISTENCE']) assert.ok(form.get('modes').split(',').includes(mode));
    own = { ...Object.fromEntries(form), id: 'owned', active: true };
    return json({ status: 'success', subscription: own });
  } });
  const input = { url: 'https://app.connektly.in/api/gupshup/webhook/gs-app', tag: 'Connektly_channel', secret: 'bound-secret' };
  assert.equal(await client.ensureSubscription('gs-app', input), 'owned');
  assert.equal(await client.ensureSubscription('gs-app', input), 'owned');
  assert.deepEqual(calls.filter((c) => c.init.method !== 'GET').map((c) => c.init.method), ['POST', 'PUT']);
  assert.equal(calls.some((c) => c.init.method === 'DELETE' || c.url.endsWith('/other')), false);
});

test('messaging, marketing, read receipts, blocks and once-only sync use documented provider routes', async () => {
  const requests = [];
  const client = provider.createGupshupClient({ ...settings, fetch: async (url, init) => {
    requests.push({ url, init });
    return url.endsWith('/coex/sync') ? json({ status: 'success', data: { request_id: 'sync-1' } })
      : url.endsWith('/v1/event') || url.endsWith('/user/unblock') ? json({ status: 'success' })
      : json({ messages: [{ id: 'gs-uuid' }] });
  } });
  const body = { messaging_product: 'whatsapp', to: '919123456', type: 'text', text: { body: 'Example' } };
  assert.equal((await client.send('gs-app', body)).messages[0].id, 'gs-uuid');
  await client.send('gs-app', body, true);
  assert.deepEqual(await client.send('gs-app', { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.inbound' }), { success: true });
  await client.blockedUsers('gs-app', 'DELETE', { block_users: [{ user: '919123456' }] });
  assert.equal((await client.sync('gs-app', 'history')).request_id, 'sync-1');
  assert.deepEqual(requests.map((r) => new URL(r.url).pathname), ['/partner/app/gs-app/v3/message', '/partner/app/gs-app/onboarding/marketing/msg', '/partner/app/gs-app/v1/event', '/partner/app/gs-app/user/unblock', '/partner/app/gs-app/coex/sync']);
  assert.equal(new URLSearchParams(requests.at(-1).init.body).get('syncType'), 'history');
});

test('callback authentication and omitted status identities remain scoped to one app and channel', () => {
  const channel = { id: 'channel', waba_id: '123', phone_number_id: '456', metadata: { gupshup: { appId: 'gs-app' } } };
  const secret = provider.gupshupCallbackSecret('private-root', 'channel', 'gs-app');
  assert.ok(provider.verifyGupshupCallbackSecret(secret, secret));
  assert.equal(provider.verifyGupshupCallbackSecret(secret, provider.gupshupCallbackSecret('private-root', 'other', 'gs-app')), false);
  const payload = { gs_app_id: 'gs-app', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.out', gs_id: 'gs-uuid', status: 'delivered' }] } }] }] };
  const normalized = provider.normalizeGupshupWebhook(payload, channel);
  assert.equal(normalized.entry[0].id, '123');
  assert.equal(normalized.entry[0].changes[0].value.metadata.phone_number_id, '456');
  for (const bad of [
    { ...payload, gs_app_id: 'other' },
    { ...payload, entry: [{ id: 'other', changes: payload.entry[0].changes }] },
    { ...payload, entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'other' } } }] }] },
    { ...payload, entry: [{ changes: [{ field: 'account_update', value: { waba_info: { waba_id: 'other' } } }] }] },
    { ...payload, entry: [{ changes: [{ field: 'partner_solutions', value: { solution_status: 'ACTIVE' } }] }] },
  ]) assert.throws(() => provider.normalizeGupshupWebhook(bad, channel));
  const mps = provider.normalizeGupshupWebhook({ gs_app_id: 'gs-app', entry: [{ id: 'provider-portfolio', changes: [{ field: 'account_update', value: { waba_info: { waba_id: '123' } } }] }] }, channel);
  assert.equal(mps.entry[0].changes[0].value.waba_info.waba_id, '123');
});

function database(initial) {
  let row = clone(initial);
  return { get row() { return row; }, from() {
    let patch, single = false; const filters = [];
    const q = { select() { return q; }, eq(key, value) { filters.push((r) => typeof r[key] === 'object' ? JSON.stringify(r[key]) === value : r[key] === value); return q; },
      contains(key, subset) {
        const contains = (v, expected) => expected && typeof expected === 'object' ? v && Object.entries(expected).every(([k, item]) => contains(v[k], item)) : v === expected;
        filters.push((r) => contains(r[key], subset)); return q;
      },
      in(key, values) { filters.push((r) => values.includes(r[key])); return q; },
      is(key, value) { filters.push((r) => r[key] == value); return q; }, update(value) { patch = clone(value); return q; },
      maybeSingle() { single = true; return run(); }, single() { single = true; return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
    async function run() { const matches = row && filters.every((f) => f(row)); if (patch && matches) row = { ...row, ...patch }; return { data: clone(matches ? single ? row : [row] : single ? null : []), error: null }; }
    return q;
  } };
}
async function sandbox(names, overrides = {}, routes = []) {
  const nodes = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text) ||
    ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ['get', 'post'].includes(node.expression.expression.name?.text) && routes.includes(node.expression.arguments[0]?.text));
  const compiled = await transform(nodes.map((node) => node.getText(ast)).join('\n'), { loader: 'ts' });
  const handlers = new Map();
  const context = vm.createContext({ console: { info() {}, error() {}, warn() {} }, crypto, Buffer, URL, Date, process,
    ...provider, ...partner, ...persistence, ...sync, ...queue,
    metaAppId: partner.WHATSAPP_SOLUTION_OWNER_APP_ID, metaAppSecret: 'secret',
    frontendOrigin: 'https://app.connektly.in',
    isRecord: (v) => v && typeof v === 'object' && !Array.isArray(v),
    normalizeOptionalString: (v) => typeof v === 'string' ? v.trim() || null : null,
    normalizeOptionalIdentifier: (v) => typeof v === 'string' ? v.trim() || null : null,
    getMetaChannelMetadata: (r) => r.metadata || {}, mapDbError: (e) => e.message,
    app: { post: (path, fn) => handlers.set(path, fn), get: (path, fn) => handlers.set(path, fn) },
    ...overrides,
  });
  vm.runInContext(compiled.code, context);
  return { context, handlers };
}
const baseChannel = () => ({ id: 'channel', user_id: 'owner', waba_id: '123', phone_number_id: '456', display_phone_number: '+91 9123456', setup_type: 'exclusive', status: 'pending',
  metadata: { partnerSolution: { id: partner.WHATSAPP_PARTNER_SOLUTION_ID, status: 'UNVERIFIED' } } });

test('actual partner app activation durably claims creation and reconciles uncertain results without replay', async () => {
  const db = database(baseChannel()); let creates = 0, present = false;
  const { context } = await sandbox(['assertPartnerSolutionForWaba', 'prepareGupshupChannel'], {
    adminSupabase: db,
    process: { env: { GUPSHUP_PARTNER_TOKEN: 'secret', GUPSHUP_WEBHOOK_SECRET: 'root', GUPSHUP_WALLET_NAME: 'Connektly' } },
    metaRequest: async ({ path }) => path.endsWith('/solutions') ? { data: [{ id: partner.WHATSAPP_PARTNER_SOLUTION_ID, status: 'ACTIVE' }] }
      : { data: [{ object: 'whatsapp_business_account', fields: ['messages', 'account_update', 'partner_solutions'] }] },
    assertCoexistenceStorageReady: async () => {}, assertWhatsAppPhoneBelongsToWaba: async () => {},
    fetchPhoneNumber: async () => ({ display_phone_number: '919123456' }), getRequestOrigin: () => 'https://app.connektly.in',
    gupshup: {
      findApps: async () => present ? [{ id: 'gs-app' }] : [], createApp: async () => { creates++; throw new Error('Connection interrupted'); },
      details: async () => ({ id: 'gs-app', phone: '919123456', live: true, stopped: false, provider: 'OD' }),
      health: async () => ({ phone: '919123456', wabaId: '123', accountStatus: 'ACTIVE', dockerStatus: 'CONNECTED', canSendMessage: 'AVAILABLE' }),
      ensureSubscription: async () => 'subscription',
    },
  });
  const run = () => context.prepareGupshupChannel({ userId: 'owner', row: clone(db.row), accessToken: 'meta-secret', req: {} });
  const concurrent = await Promise.allSettled([run(), run()]);
  assert.equal(concurrent.every((result) => result.status === 'rejected'), true);
  assert.equal(creates, 1, 'Concurrent workers must share one durable creation claim');
  assert.equal(db.row.metadata.gupshup.creation.status, 'unknown');
  await assert.rejects(run(), /previous Gupshup app creation/);
  assert.equal(creates, 1);
  present = true;
  const ready = await run();
  assert.equal(ready.metadata.gupshup.status, 'ready');
  assert.equal(ready.metadata.gupshup.appId, 'gs-app');
  assert.equal(creates, 1);
});

test('an explicit authentication rejection is recorded and permits a new creation attempt after credentials are fixed', async () => {
  const db = database(baseChannel()); let creates = 0;
  const { context } = await sandbox(['assertPartnerSolutionForWaba', 'prepareGupshupChannel'], {
    adminSupabase: db, process: { env: { GUPSHUP_PARTNER_TOKEN: 'secret', GUPSHUP_WEBHOOK_SECRET: 'root' } },
    metaRequest: async ({ path }) => path.endsWith('/solutions') ? { data: [{ id: partner.WHATSAPP_PARTNER_SOLUTION_ID, status: 'ACTIVE' }] }
      : { data: [{ object: 'whatsapp_business_account', fields: ['messages', 'account_update', 'partner_solutions'] }] },
    assertCoexistenceStorageReady: async () => {}, assertWhatsAppPhoneBelongsToWaba: async () => {},
    fetchPhoneNumber: async () => ({ display_phone_number: '919123456' }),
    gupshup: { findApps: async () => [], createApp: async () => {
      creates++;
      if (creates === 1) throw new provider.GupshupApiError('SDK app creation', 401, 'rejected', 'Authentication rejected');
      return 'gs-app';
    }, details: async () => ({ id: 'gs-app', phone: '919123456', live: true, stopped: false, provider: 'OD' }),
    health: async () => ({ phone: '919123456', wabaId: '123', accountStatus: 'ACTIVE', dockerStatus: 'CONNECTED', canSendMessage: 'AVAILABLE' }),
    ensureSubscription: async () => 'subscription' },
  });
  const run = () => context.prepareGupshupChannel({ userId: 'owner', row: clone(db.row), accessToken: 'meta-secret', req: {} });
  await assert.rejects(run(), /Authentication rejected/);
  assert.equal(db.row.metadata.gupshup.creation.status, 'rejected');
  assert.equal(db.row.metadata.gupshup.creation.httpStatus, 401);
  assert.equal((await run()).metadata.gupshup.status, 'ready');
  assert.equal(creates, 2);
});

test('partner authentication preflight reports upstream rejection without expiring the customer session', async () => {
  const { handlers } = await sandbox([], {
    gupshup: { checkPartnerAuthentication: async () => { throw new provider.GupshupApiError('partner app lookup', 401, 'rejected', 'Partner authentication rejected'); } },
    sendError: (res, status, error) => res.status(status).json({ error: error.message }),
  }, ['/api/meta/partner/authentication']);
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handlers.get('/api/meta/partner/authentication')({}, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.error, 'Partner authentication rejected');
});

test('actual transport uses Gupshup, refuses pending routes, preserves direct Meta, and never falls back after failure', async () => {
  const channel = baseChannel(); channel.status = 'connected'; channel.metadata.partnerSolution.status = 'ACTIVE';
  channel.metadata.gupshup = { appId: 'gs-app', status: 'ready' };
  const db = database(channel); let calls = 0, metaCalls = 0;
  const { context } = await sandbox(['routePartnerWhatsAppSend', 'metaRequest'], {
    adminSupabase: db, graphVersion: 'v25.0', paceCoexistenceGraphSend: async () => {},
    whatsappSendPhoneId: ({ path, method, graphHost, body }) => method === 'POST' && graphHost === 'graph.facebook.com' && body?.messaging_product === 'whatsapp' ? /^(\d+)\/(?:messages|marketing_messages)$/.exec(path)?.[1] : null,
    gupshup: { send: async () => { calls++; throw new Error('Provider timeout'); } },
    fetch: async () => { metaCalls++; return json({ messages: [{ id: 'wamid.direct' }] }); },
  });
  const input = { accessToken: 'meta-secret', path: '456/messages', method: 'POST', body: { messaging_product: 'whatsapp', type: 'text' } };
  await assert.rejects(context.metaRequest(input), /Provider timeout/);
  assert.equal(calls, 1); assert.equal(metaCalls, 0);
  db.row.status = 'pending';
  await assert.rejects(context.metaRequest(input), /not ready/);
  assert.equal(calls, 1);
  db.row.metadata = {}; db.row.status = 'connected';
  assert.equal((await context.metaRequest(input)).messages[0].id, 'wamid.direct');
  assert.equal(metaCalls, 1);
});

test('partner tickets cannot be changed to a direct solution and direct capabilities are preserved', () => {
  const claims = { userId: 'owner', appId: partner.WHATSAPP_SOLUTION_OWNER_APP_ID, configId: 'config', oauthState: 'state', accessToken: 'secret', solutionId: partner.WHATSAPP_PARTNER_SOLUTION_ID };
  const ticket = tickets.createEmbeddedSignupTicket(claims, 'secret');
  assert.equal(tickets.readEmbeddedSignupTicket(ticket.signupTicket, claims, 'secret').solutionId, claims.solutionId);
  assert.throws(() => tickets.readEmbeddedSignupTicket(ticket.signupTicket, { ...claims, solutionId: undefined }, 'secret'));
  const channel = { setupType: 'exclusive', metadata: baseChannel().metadata };
  assert.equal(capabilities.getWhatsAppCapabilities(channel).canUseCallingApi, false);
  assert.equal(capabilities.getWhatsAppCapabilities(channel).canRegisterSender, false);
  assert.equal(capabilities.getWhatsAppCapabilities({ setupType: 'exclusive', metadata: {} }).canUseCallingApi, true);
  assert.equal(ids.getWhatsAppMessageId({ waMessageId: 'gs-uuid', raw: {} }), null);
  assert.equal(ids.getWhatsAppMessageId({ waMessageId: 'gs-uuid', raw: { gupshup_whatsapp_message_id: 'wamid.out' } }), 'wamid.out');
});

test('switching phones and reauthorizing cannot erase an interrupted provider app creation claim', () => {
  const original = baseChannel();
  original.metadata.gupshup = { creation: { status: 'unknown', attemptId: 'claimed-once' } };
  const other = persistence.mergeMetaChannelSaveMetadata({ existingRow: original, setupType: 'exclusive', wabaId: 'other-waba', phoneNumberId: 'other-phone', metadataPatch: {} });
  const restored = persistence.mergeMetaChannelSaveMetadata({ existingRow: { ...original, waba_id: 'other-waba', phone_number_id: 'other-phone', metadata: other },
    setupType: 'exclusive', wabaId: '123', phoneNumberId: '456', metadataPatch: { partnerSolution: { id: partner.WHATSAPP_PARTNER_SOLUTION_ID, status: 'UNVERIFIED' } } });
  assert.equal(restored.gupshup.creation.attemptId, 'claimed-once');
  assert.equal(restored.gupshup.creation.status, 'unknown');
});

test('actual provider callback commits durably before acknowledgment and rejects a different app', async () => {
  const row = baseChannel(); row.metadata.gupshup = { appId: 'gs-app' };
  const db = database(row); const events = []; let storageFailure = false;
  const { handlers } = await sandbox([], {
    adminSupabase: db, process: { env: { GUPSHUP_WEBHOOK_SECRET: 'root' } },
    coexistenceWebhookQueue: { enqueue: async () => { events.push('durable'); if (storageFailure) throw new Error('Storage failed'); }, kick: () => events.push('process') },
    sendError: (res, status) => res.status(status).end(),
  }, ['/api/gupshup/webhook/:appId']);
  const handler = handlers.get('/api/gupshup/webhook/:appId');
  const request = { params: { appId: 'gs-app' }, get: () => provider.gupshupCallbackSecret('root', 'channel', 'gs-app'),
    body: { gs_app_id: 'gs-app', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'gs-uuid', status: 'enqueued' }] } }] }] } };
  const response = () => ({ code: 200, status(c) { this.code = c; return this; }, end() { events.push('ack'); }, sendStatus(c) { this.code = c; } });
  await handler(request, response());
  assert.deepEqual(events, ['durable', 'ack', 'process']);
  events.length = 0; storageFailure = true;
  const failed = response(); await handler(request, failed);
  assert.equal(failed.code, 500); assert.deepEqual(events, ['durable', 'ack']);
  events.length = 0;
  const denied = response(); await handler({ ...request, get: () => 'incorrect-secret' }, denied);
  assert.equal(denied.code, 403); assert.equal(events.length, 0);
});

test('actual solution lifecycle rejects stale events and does not automatically reactivate messaging', async () => {
  const row = baseChannel(); row.status = 'connected'; row.metadata.partnerSolution.status = 'ACTIVE'; row.metadata.gupshup = { appId: 'gs-app', status: 'ready' };
  const db = database(row);
  const { context } = await sandbox(['handlePartnerSolutionWebhook'], { adminSupabase: db });
  await context.handlePartnerSolutionWebhook({ solution_id: partner.WHATSAPP_PARTNER_SOLUTION_ID, solution_status: 'DEACTIVATED', event: 'SOLUTION_UPDATED' }, '2026-10-17T10:00:00Z');
  assert.equal(db.row.status, 'pending'); assert.equal(db.row.metadata.gupshup.status, 'pending');
  await context.handlePartnerSolutionWebhook({ solution_id: partner.WHATSAPP_PARTNER_SOLUTION_ID, solution_status: 'ACTIVE' }, '2026-10-17T09:00:00Z');
  assert.equal(db.row.metadata.partnerSolution.status, 'DEACTIVATED');
  await context.handlePartnerSolutionWebhook({ solution_id: partner.WHATSAPP_PARTNER_SOLUTION_ID, solution_status: 'ACTIVE' }, '2026-10-17T11:00:00Z');
  assert.equal(db.row.metadata.partnerSolution.status, 'ACTIVE'); assert.equal(db.row.status, 'pending');
});

test('MPS account_update routing uses waba_info instead of the provider portfolio entry ID', async () => {
  const jobs = [];
  const { context } = await sandbox(['processWhatsAppWebhookPayload'], {
    coexistenceTimestamp: () => '2026-10-17T10:00:00Z', coexistenceWebhookQueue: { enqueue: async (job) => jobs.push(job) },
  });
  await context.processWhatsAppWebhookPayload({ entry: [{ id: 'provider-portfolio', changes: [{ field: 'account_update', value: { event: 'PARTNER_ADDED', waba_info: { waba_id: '123', solution_id: partner.WHATSAPP_PARTNER_SOLUTION_ID } } }] }] });
  assert.equal(jobs[0].wabaId, '123');
});

test('actual delivery status reconciliation matches gs_id, preserves wamid for replies, and ignores delayed lower states', async () => {
  const db = database({ id: 'message', user_id: 'owner', wa_message_id: 'gs-uuid', direction: 'outbound', status: 'sent', raw: {} });
  const emitted = [];
  const { context } = await sandbox(['mergeWhatsAppStatusPayloadIntoRaw', 'updateOutgoingWhatsAppMessageStatus'], {
    adminSupabase: db, mapMessage: (row) => row, dispatchDeveloperWebhookEvent: async (_owner, event) => emitted.push(event),
  });
  const status = (value) => context.updateOutgoingWhatsAppMessageStatus({ userId: 'owner', statusRecord: { id: 'wamid.out', gs_id: 'gs-uuid', status: value } });
  await status('read'); await status('enqueued'); await status('failed');
  assert.equal(db.row.status, 'read');
  assert.equal(db.row.wa_message_id, 'gs-uuid');
  assert.equal(db.row.raw.gupshup_whatsapp_message_id, 'wamid.out');
  assert.deepEqual(emitted, ['message.read']);
  await assert.rejects(context.updateOutgoingWhatsAppMessageStatus({ userId: 'other', statusRecord: { gs_id: 'gs-uuid' }, retryUnmatched: true }), /Waiting/);
});

test('actual partner coexistence activation uses provider sync with the same durable once-only store', async () => {
  const row = baseChannel(); row.setup_type = 'coexistence'; row.metadata.partnerSolution.status = 'ACTIVE';
  row.metadata.gupshup = { appId: 'gs-app', status: 'ready' };
  row.metadata.coexistence = { isOnBizApp: true, platformType: 'CLOUD_API' };
  row.metadata.coexistenceSync = { onboardingId: 'one-lifecycle', onboardedAt: new Date().toISOString(), contacts: { status: 'not_requested' }, history: { status: 'not_requested' } };
  const db = database(row), operations = [];
  const { context } = await sandbox(['activateCoexistenceWhatsAppChannel'], {
    adminSupabase: db, requireMetaAppCredentials() {}, requireMetaWebhookVerifyToken() {},
    metaWebhookVerifyToken: 'verify', getMetaWebhookCallbackUrl: () => 'https://app.connektly.in/api/meta/webhook',
    resolveCoexistencePhone: async () => ({ id: '456', is_on_biz_app: true, platform_type: 'CLOUD_API' }),
    subscribeWhatsAppWebhookApp: async () => {}, listWhatsAppSubscribedApps: async () => ({ data: [{ id: 'own-app' }] }),
    resolveWhatsAppWebhookSubscriptionEntry: (entries) => entries[0], assertCoexistenceWebhookPrerequisites: async () => ['messages', 'history'],
    assertCoexistenceStorageReady: async () => {},
    metaRequest: async () => { throw new Error('Direct Meta sync must not be used'); },
    gupshup: { sync: async (appId, kind) => { operations.push([appId, kind]); return { request_id: kind + '-request' }; } },
  });
  const run = () => context.activateCoexistenceWhatsAppChannel({ userId: 'owner', row: clone(db.row), accessToken: 'meta-token', req: {} });
  const result = await run(); await run();
  assert.equal(result.status, 'connected');
  assert.deepEqual(operations, [['gs-app', 'smb_app_state_sync'], ['gs-app', 'history']]);
  assert.equal(db.row.metadata.coexistenceSync.history.requestId, 'history-request');
  assert.equal(db.row.metadata.embeddedSignup.billing.type, 'solution_partner_credit_line');
});
