import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sdkBundle = await build({
  entryPoints: ['src/lib/meta-sdk.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'MetaSdk',
  define: { 'import.meta.env': JSON.stringify({ VITE_META_APP_ID: '797649033413847', VITE_META_GRAPH_VERSION: 'v25.0' }) },
});
const ticketBundle = await build({
  entryPoints: ['server/embedded-signup-ticket.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'node',
});
const ticketModule = { exports: {} };
vm.runInNewContext(ticketBundle.outputFiles[0].text, {
  module: ticketModule, exports: ticketModule.exports, require, Buffer,
});
const { createEmbeddedSignupTicket, readEmbeddedSignupTicket } = ticketModule.exports;
const serverSource = fs.readFileSync('server.ts', 'utf8');
const serverAst = ts.createSourceFile('server.ts', serverSource, ts.ScriptTarget.Latest, true);

async function serverSandbox(functionNames = [], routePaths = [], overrides = {}) {
  const functions = serverAst.statements.filter((node) => ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text));
  const routes = serverAst.statements.filter((node) => ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) && node.expression.expression.name?.text === 'post' &&
    routePaths.includes(node.expression.arguments[0]?.text));
  assert.equal(functions.length, functionNames.length, 'Find actual server functions');
  assert.equal(routes.length, routePaths.length, 'Find actual server routes');
  const compiled = await transform([...functions, ...routes].map((node) => node.getText(serverAst)).join('\n'), { loader: 'ts' });
  const handlers = new Map();
  const context = vm.createContext({
    console, crypto, Buffer, URL, AbortSignal,
    metaAppId: '797649033413847', metaAppSecret: 'test-app-secret', graphVersion: 'v25.0',
    encryptionKey: Buffer.alloc(32, 1),
    WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '959911236622056',
    isRecord: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    normalizeOptionalString: (value) => typeof value === 'string' ? value.trim() || null : null,
    normalizeOptionalIdentifier: (value) => typeof value === 'string' ? value.trim() || null : null,
    mapDbError: (error) => error.message,
    app: { post: (path, handler) => handlers.set(path, handler) },
    sendError: (res, status, error) => res.status(status).json({ error: error.message }),
    ...overrides,
  });
  vm.runInContext(compiled.code, context);
  return { context, handlers };
}

function browser() {
  const listeners = new Map(), timers = new Map(), logins = [], exchanges = [];
  let timerId = 0;
  const window = {
    location: { hostname: 'app.connektly.in', protocol: 'https:', origin: 'https://app.connektly.in', pathname: '/onboarding/channel-connection' },
    crypto: crypto.webcrypto,
    setTimeout(callback, milliseconds) { timers.set(++timerId, { callback, milliseconds }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    FB: { init() {}, AppEvents: { logPageView() {} }, login: (callback, options) => logins.push({ callback, options }) },
  };
  const context = vm.createContext({ window, console, URL });
  vm.runInContext(sdkBundle.outputFiles[0].text, context);
  const api = context.MetaSdk;
  return {
    window, api, timers, listeners, logins, exchanges,
    onCode(input) { exchanges.push(input); return Promise.resolve({ signupTicket: 'opaque-ticket', expiresAt: '2099-01-01T00:00:00Z' }); },
    message(data, origin = 'https://www.facebook.com') { listeners.get('message')?.({ data, origin }); },
    fireTimeout(milliseconds) { [...timers.values()].find((timer) => timer.milliseconds === milliseconds)?.callback(); },
  };
}
const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123', phone_number_id: '456', business_id: '789' } };
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

for (const order of ['code-first', 'assets-first']) {
  test(`SDK completion: ${order}, without requiring connected status`, async () => {
    const b = browser();
    await b.api.ensureMetaSdkReady();
    const pending = b.api.beginEmbeddedSignup({ onCode: b.onCode });
    assert.equal(b.logins.length, 1, 'Launch synchronously from the click');
    assert.deepEqual(JSON.parse(JSON.stringify(b.logins[0].options)), {
      config_id: '959911236622056', response_type: 'code', override_default_response_type: true,
      extras: { setup: {}, version: 'v4', sessionInfoVersion: 3 },
    });
    if (order === 'assets-first') b.message(JSON.stringify(finish));
    b.logins[0].callback({ authResponse: { code: 'one-time-code' } });
    assert.equal(b.exchanges.length, 1, 'Exchange immediately before awaiting any other event');
    assert.equal(b.exchanges[0].code, 'one-time-code');
    if (order === 'code-first') {
      await flush();
      assert.equal(b.timers.size, 2, 'Do not fail after the former three-second deadline');
      b.message(finish);
    }
    const result = await pending;
    assert.equal(result.signupTicket, 'opaque-ticket');
    assert.equal(result.wabaId, '123');
    assert.equal(result.phoneNumberId, '456');
    assert.equal(result.setupContext.data.business_id, '789');
    assert.equal('code' in result, false);
    assert.equal(b.listeners.size, 0);
    assert.equal(b.timers.size, 0);
  });
}

test('Reject spoofed origins, malformed messages, duplicate callbacks, and concurrent launches', async () => {
  const b = browser();
  await b.api.ensureMetaSdkReady();
  const pending = b.api.beginEmbeddedSignup({ onCode: b.onCode });
  await assert.rejects(b.api.beginEmbeddedSignup({ onCode: b.onCode }), /already open/);
  for (const origin of ['https://facebook.com.evil.test', 'https://evilfacebook.com', 'http://www.facebook.com', 'https://facebook.com:8443', 'null']) b.message(finish, origin);
  b.message('invalid json');
  b.message({ type: 'WA_EMBEDDED_SIGNUP', event: 123 });
  b.logins[0].callback({ authResponse: { code: 'code' } });
  b.logins[0].callback({ authResponse: { code: 'duplicate' } });
  let resolved = false;
  pending.then(() => { resolved = true; });
  await flush();
  assert.equal(resolved, false);
  assert.equal(b.exchanges.length, 1);
  b.message(finish, 'https://web.facebook.com');
  await pending;
});

for (const [event, data, pattern] of [
  ['CANCEL', { current_step: 'PHONE_NUMBER_SETUP' }, /PHONE_NUMBER_SETUP/],
  ['CANCEL', { error_message: 'Invalid display name' }, /Invalid display name/],
  ['ERROR', { error_message: 'Meta reported an error' }, /Meta reported an error/],
  ['FINISH_ONLY_WABA', { waba_id: '123' }, /without a phone number/],
  ['FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', finish.data, /standard Cloud API/],
  ['FINISH', { waba_id: '123' }, /without the WhatsApp account and phone number IDs/],
]) {
  test(`SDK event ${event} provides a recoverable error`, async () => {
    const b = browser();
    await b.api.ensureMetaSdkReady();
    const pending = b.api.beginEmbeddedSignup({ onCode: b.onCode });
    b.message({ type: 'WA_EMBEDDED_SIGNUP', event, data });
    await assert.rejects(pending, pattern);
    assert.equal(b.listeners.size, 0);
    assert.equal(b.timers.size, 0);
  });
}

test('Abort, overall timeout, missing details, and exchange failure release the flow', async () => {
  for (const mode of ['abort', 'timeout', 'details', 'exchange', 'sync-exchange', 'missing-code']) {
    const b = browser();
    await b.api.ensureMetaSdkReady();
    const controller = new AbortController();
    const onCode = mode === 'exchange' ? () => Promise.reject(new Error('Exchange failed'))
      : mode === 'sync-exchange' ? () => { throw new Error('Exchange failed'); } : b.onCode;
    const pending = b.api.beginEmbeddedSignup({ onCode, signal: controller.signal });
    if (mode === 'abort') controller.abort();
    else if (mode === 'timeout') b.fireTimeout(600000);
    else if (mode === 'missing-code') b.logins[0].callback({ status: 'unknown' });
    else {
      b.logins[0].callback({ authResponse: { code: 'code' } });
      if (mode === 'details') { await flush(); b.fireTimeout(60000); }
    }
    await assert.rejects(pending);
    assert.equal(b.listeners.size, 0, mode);
    assert.equal(b.timers.size, 0, mode);
    const retryController = new AbortController();
    const retry = b.api.beginEmbeddedSignup({ onCode: b.onCode, signal: retryController.signal });
    assert.equal(b.logins.length, 2, 'A new attempt can start');
    retryController.abort();
    await assert.rejects(retry);
  }
});

test('Require initialized SDK and HTTPS before opening a popup', async () => {
  const b = browser();
  await assert.rejects(b.api.beginEmbeddedSignup({ onCode: b.onCode }), /still loading/);
  await b.api.ensureMetaSdkReady();
  b.window.location.protocol = 'http:';
  await assert.rejects(b.api.beginEmbeddedSignup({ onCode: b.onCode }), /requires HTTPS/);
  assert.equal(b.logins.length, 0);
});

test('Handoff tickets encrypt tokens, expire, and reject tampering or mismatched identity', () => {
  const claims = { userId: 'user-1', appId: 'app-1', configId: 'config-1', oauthState: 'state-1', accessToken: 'secret-business-token' };
  const { accessToken, ...expected } = claims;
  const ticket = createEmbeddedSignupTicket(claims, 'server-secret', 1000);
  assert.equal(readEmbeddedSignupTicket(ticket.signupTicket, expected, 'server-secret', 2000).accessToken, accessToken);
  assert.equal(Buffer.from(ticket.signupTicket, 'base64url').includes(Buffer.from(accessToken)), false);
  assert.throws(() => readEmbeddedSignupTicket(ticket.signupTicket, expected, 'server-secret', 601000), /expired/);
  assert.throws(() => readEmbeddedSignupTicket(ticket.signupTicket, expected, 'wrong-secret', 2000), /invalid/);
  for (const key of ['userId', 'appId', 'configId', 'oauthState']) {
    assert.throws(() => readEmbeddedSignupTicket(ticket.signupTicket, { ...expected, [key]: 'different' }, 'server-secret', 2000), /invalid/);
  }
  const tampered = Buffer.from(ticket.signupTicket, 'base64url');
  tampered[30] ^= 1;
  assert.throws(() => readEmbeddedSignupTicket(tampered.toString('base64url'), expected, 'server-secret', 2000), /invalid/);
});

test('Server exchanges SDK codes once, with credentials and no redirect URI guessing', async () => {
  const calls = [];
  const { context } = await serverSandbox(['exchangeEmbeddedSignupCode'], [], {
    requireMetaAppCredentials() {}, buildEmbeddedSignupRedirectUriCandidates: () => ['https://unrelated.example/callback'],
    fetch: async (url) => { calls.push(new URL(url)); return { ok: true, json: async () => ({ access_token: 'business-token' }) }; },
  });
  assert.equal(await context.exchangeEmbeddedSignupCode('code', { sdkFlow: true }), 'business-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('client_id'), '797649033413847');
  assert.equal(calls[0].searchParams.get('code'), 'code');
  assert.equal(calls[0].searchParams.has('redirect_uri'), false);
});

test('Verify phone membership across WABA phone-number pagination', async () => {
  const calls = [];
  const { context } = await serverSandbox(['assertWhatsAppPhoneBelongsToWaba'], [], {
    metaRequest: async (input) => {
      calls.push(input);
      return input.query.after ? { data: [{ id: '456' }] } : { data: [{ id: 'other' }], paging: { next: 'next-page', cursors: { after: 'cursor' } } };
    },
  });
  await context.assertWhatsAppPhoneBelongsToWaba('token', '123', '456');
  assert.equal(calls[1].query.after, 'cursor');
  await assert.rejects(context.assertWhatsAppPhoneBelongsToWaba('token', '123', 'wrong-phone'), /does not belong/);
});

for (const failure of [null, 'registration', 'webhook']) {
  test(`Server activation: ${failure || 'complete'}, with idempotent registration retry`, async () => {
    const row = { id: 'channel-1', user_id: 'user-1', status: 'pending', metadata: {} };
    let registrations = 0;
    const { context } = await serverSandbox(['activateEmbeddedWhatsAppChannel'], [], {
      getMetaChannelMetadata: (value) => value.metadata,
      getMetaChannelRow: async () => row,
      autoRegisterWhatsAppSenderForChannel: async () => {
        registrations++;
        if (failure === 'registration') throw new Error('Registration failed');
        row.metadata.autoRegistration = { status: 'registered' };
        return { row };
      },
      syncWhatsAppWebhookSubscription: async () => {
        if (failure === 'webhook') throw new Error('Webhook failed');
        row.metadata.webhookSubscription = { isSubscribed: true };
        return row;
      },
      adminSupabase: { from() { return {
        update(value) { Object.assign(row, value); return this; }, eq() { return this; }, select() { return this; },
        single: async () => ({ data: row, error: null }),
      }; } },
    });
    const result = await context.activateEmbeddedWhatsAppChannel({ userId: 'user-1', row, accessToken: 'token', req: {} });
    assert.equal(result.status, failure ? 'pending' : 'connected');
    assert.equal(result.metadata.embeddedSignup.status, failure ? 'activation_failed' : 'setup_complete');
    assert.equal(result.metadata.embeddedSignup.billing.type, 'customer_payment_method');
    if (failure) assert.match(result.metadata.embeddedSignup.lastError, /failed/i);
    if (failure !== 'registration') {
      await context.activateEmbeddedWhatsAppChannel({ userId: 'user-1', row, accessToken: 'token', req: {} });
      assert.equal(registrations, 1, 'Do not register again when only webhook activation needs retry');
    }
  });
}

test('Webhook subscription must match this app, never an arbitrary subscribed app', async () => {
  const { context } = await serverSandbox(['resolveWhatsAppWebhookSubscriptionEntry'], [], {
    getWhatsAppSubscribedAppData: (entry) => entry.whatsapp_business_api_data || entry,
  });
  assert.equal(context.resolveWhatsAppWebhookSubscriptionEntry([{ id: 'another-app' }]), null);
  const ownApp = { whatsapp_business_api_data: { id: '797649033413847' } };
  assert.equal(context.resolveWhatsAppWebhookSubscriptionEntry([{ id: 'another-app' }, ownApp]), ownApp);
});

test('Meta webhook verifies signature and dispatches account_update events', async () => {
  const updates = [];
  const { handlers } = await serverSandbox(['timingSafeCompareHex'], ['/api/meta/webhook'], {
    handleWhatsAppAccountUpdateWebhook: async (wabaId, value) => updates.push({ wabaId, value }),
  });
  const body = { entry: [{ id: '123', changes: [{ field: 'account_update', value: { event: 'PARTNER_ADDED' } }] }] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${crypto.createHmac('sha256', 'test-app-secret').update(rawBody).digest('hex')}`;
  function response() { return { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; }, sendStatus(value) { this.statusCode = value; }, send(value) { this.body = value; } }; }
  const handler = handlers.get('/api/meta/webhook');
  const denied = response();
  await handler({ body, rawBody, get: () => 'sha256=bad' }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(updates.length, 0);
  const accepted = response();
  await handler({ body, rawBody, get: () => signature }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(updates[0].wabaId, '123');
});

function apiResponse() {
  return {
    statusCode: 200, headers: {},
    status(value) { this.statusCode = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; },
  };
}

test('Code exchange endpoint returns only a protected ticket bound to the authenticated user', async () => {
  let exchanges = 0;
  const { handlers } = await serverSandbox([], ['/api/meta/connect/embedded/exchange'], {
    requireMetaWebhookVerifyToken() {}, createEmbeddedSignupTicket,
    exchangeEmbeddedSignupCode: async (code, options) => {
      exchanges++;
      assert.equal(code, 'meta-code');
      assert.equal(options.sdkFlow, true);
      return 'customer-business-token';
    },
  });
  const input = { code: 'meta-code', configId: '959911236622056', oauthState: 'core_onboarding:abcdef' };
  const handler = handlers.get('/api/meta/connect/embedded/exchange');
  const response = apiResponse();
  await handler({ authedUser: { id: 'user-1' }, body: input }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(response.body).sort(), ['expiresAt', 'signupTicket']);
  assert.equal(readEmbeddedSignupTicket(response.body.signupTicket, {
    userId: 'user-1', appId: '797649033413847', configId: input.configId, oauthState: input.oauthState,
  }, 'test-app-secret').accessToken, 'customer-business-token');
  const invalid = apiResponse();
  await handler({ authedUser: { id: 'user-1' }, body: { ...input, configId: 'unrelated-login-config' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(exchanges, 1, 'Invalid configurations are rejected before exchanging a code');
});

test('Completion endpoint validates the ticket and asset pair before saving, with no token/code response', async () => {
  const calls = [];
  let storedRow;
  const token = createEmbeddedSignupTicket({
    userId: 'user-1', appId: '797649033413847', configId: '959911236622056',
    oauthState: 'core_onboarding:abcdef', accessToken: 'customer-business-token',
  }, 'test-app-secret');
  const { handlers } = await serverSandbox([], ['/api/meta/connect/embedded'], {
    requireMetaAppCredentials() {}, readEmbeddedSignupTicket,
    assertWhatsAppPhoneBelongsToWaba: async (accessToken, wabaId, phoneId) => {
      assert.equal(accessToken, 'customer-business-token');
      assert.equal(wabaId, '123'); assert.equal(phoneId, '456'); calls.push('validate-pair');
    },
    fetchPhoneNumber: async () => ({ display_phone_number: '+1 555 1234', verified_name: 'Example' }),
    fetchWaba: async () => ({ id: '123', name: 'Example WABA' }),
    getNormalizedMessagingLimitTier: () => null,
    buildReusableMetaSetupContext: () => ({}),
    saveMetaChannel: async (input) => {
      calls.push('save'); assert.equal(input.status, 'pending');
      storedRow = { id: 'channel-1', status: 'pending', metadata: input.metadataPatch };
    },
    getMetaChannelRow: async () => storedRow,
    activateEmbeddedWhatsAppChannel: async (input) => { calls.push('activate'); return { ...input.row, status: 'connected' }; },
    mapChannel: (row) => ({ id: row.id, status: row.status, metadata: row.metadata }),
    syncTemplates: async () => {},
  });
  const handler = handlers.get('/api/meta/connect/embedded');
  const body = {
    signupTicket: token.signupTicket, setupType: 'exclusive', wabaId: '123', phoneNumberId: '456',
    oauthState: 'core_onboarding:abcdef',
    setupContext: { event: 'FINISH', data: finish.data },
  };
  const rejected = apiResponse();
  await handler({ authedUser: { id: 'different-user' }, body }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.equal(calls.length, 0, 'Do not query assets or write data for another user\'s ticket');
  const response = apiResponse();
  await handler({ authedUser: { id: 'user-1' }, body }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.channel.status, 'connected');
  assert.deepEqual(calls, ['validate-pair', 'save', 'activate']);
  const returned = JSON.stringify(response.body);
  assert.equal(returned.includes('customer-business-token'), false);
  assert.equal(returned.includes(token.signupTicket), false);
});
