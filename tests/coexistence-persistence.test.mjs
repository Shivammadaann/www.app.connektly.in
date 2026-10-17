import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node' });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, console, Date, setInterval, clearInterval });
  return module.exports;
}
const parser = await load('server/coexistence-webhooks.ts');
const queueModule = await load('server/coexistence-webhook-queue.ts');
const metadataModule = await load('server/coexistence-sync-store.ts');
const sync = await load('server/coexistence-sync.ts');
const policy = await load('server/coexistence-policy.ts');
const partner = await load('src/lib/whatsapp-partner.ts');
const source = fs.readFileSync('server.ts', 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const clone = (value) => JSON.parse(JSON.stringify(value));

function database(initial = {}) {
  const tables = { meta_channels: [], conversation_threads: [], conversation_messages: [], whatsapp_coexistence_webhook_jobs: [], ...clone(initial) };
  let sequence = 0;
  const db = {
    tables,
    from(table) {
      const query = {
        filters: [], operation: 'select', payload: null,
        select() { return this; },
        eq(key, value) {
          this.filters.push((row) => {
            const actual = key.split('->>').reduce((item, part) => item?.[part], row);
            return typeof actual === 'object' && actual !== null ? JSON.stringify(actual) === value : actual === value;
          }); return this;
        },
        is(key, value) { this.filters.push((row) => row[key] == value); return this; },
        contains(key, value) {
          const contains = (actual, subset) => subset && typeof subset === 'object'
            ? actual && typeof actual === 'object' && Object.entries(subset).every(([key, value]) => contains(actual[key], value)) : actual === subset;
          this.filters.push((row) => contains(row[key], value)); return this;
        },
        not(key, _operator, value) { this.filters.push((row) => key.split('->').reduce((result, key) => result?.[key], row) != value); return this; },
        range(from, to) { this.page = [from, to + 1]; return this; },
        order() { return this; },
        insert(payload) { this.operation = 'insert'; this.payload = clone(payload); return this; },
        upsert(payload, options) { this.operation = 'upsert'; this.payload = clone(payload); this.options = options; return this; },
        update(payload) { this.operation = 'update'; this.payload = clone(payload); return this; },
        async run(single = false) {
          let rows = tables[table].filter((row) => this.filters.every((filter) => filter(row)));
          if (this.page) rows = rows.slice(...this.page);
          if (this.operation === 'insert' || this.operation === 'upsert') {
            const payload = this.payload;
            const duplicate = tables[table].find((row) => table === 'conversation_messages'
              ? row.user_id === payload.user_id && row.wa_message_id === payload.wa_message_id
              : table === 'conversation_threads' ? row.user_id === payload.user_id && row.contact_wa_id === payload.contact_wa_id
                : row.id === payload.id);
            if (duplicate && this.operation === 'insert') return { data: null, error: { code: '23505' } };
            if (duplicate) return { data: null, error: null };
            const row = { id: `id-${++sequence}`, created_at: '2026-10-17T00:00:00.000Z', updated_at: '2026-10-17T00:00:00.000Z',
              attributes: {}, raw: {}, last_message_at: null, last_message_text: null, unread_count: 0,
              status: table === 'whatsapp_coexistence_webhook_jobs' ? 'pending' : 'New', attempts: 0, ...payload };
            tables[table].push(row); rows = [row];
          } else if (this.operation === 'update') for (const row of rows) Object.assign(row, this.payload);
          return { data: clone(single ? rows[0] || null : rows), error: null };
        },
        maybeSingle() { return this.run(true); }, single() { return this.run(true); },
        then(resolve, reject) { return this.run().then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) {
      const jobs = tables.whatsapp_coexistence_webhook_jobs;
      if (name === 'claim_whatsapp_coexistence_webhook_job') {
        const row = jobs.find((row) => (row.status === 'pending' || row.leaseExpired) && !row.notDue);
        if (!row) return { data: [], error: null };
        Object.assign(row, { status: 'processing', locked_by: args.p_worker_id, attempts: row.attempts + 1, leaseExpired: false });
        return { data: [clone(row)], error: null };
      }
      const row = jobs.find((row) => row.id === args.p_job_id && row.locked_by === args.p_worker_id);
      if (name === 'renew_whatsapp_coexistence_webhook_job') return { data: Boolean(row), error: null };
      if (!row) return { data: false, error: null };
      Object.assign(row, { status: args.p_error ? 'pending' : 'completed', last_error: args.p_error,
        notDue: Boolean(args.p_error), locked_by: null });
      return { data: true, error: null };
    },
  };
  return db;
}
const channel = { id: 'channel', user_id: 'owner', waba_id: '123', phone_number_id: '456', setup_type: 'coexistence',
  display_phone_number: '15550783881', status: 'connected', access_token_ciphertext: 'preserve-token',
  metadata: { coexistenceSync: { onboardingId: 'one-lifecycle', onboardedAt: '2025-02-11T00:00:00.000Z', history: { status: 'pending', requestId: 'request-1' } },
    coexistence: { lifecycle: { event: 'ONBOARDED', eventAt: '2025-02-11T00:00:00.000Z' } }, webhookSubscription: { subscribed: true } } };
const metadata = { phone_number_id: '456', display_phone_number: '15550783881' };
const customer = '16505551234';
const rawMessage = (id = 'wamid.1', type = 'text') => ({ from: customer, id, timestamp: '1739234955', type,
  ...(type === 'text' ? { text: { body: 'Historical message' } } : {}), history_context: { status: 'READ' } });
const history = (message = rawMessage()) => ({ metadata, history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 },
  threads: [{ id: customer, messages: [message] }] }] });
async function sandbox(db, overrides = {}) {
  const names = ['ensureCoexistenceContactThread', 'persistCoexistenceContact', 'advanceCoexistenceThreadPreview', 'persistCoexistenceMessage',
    'processCoexistenceWebhookJob', 'handleWhatsAppAccountUpdateWebhook', 'handlePhoneNumberNameUpdateWebhook'];
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  const code = await transform(functions.map((node) => node.getText(ast)).join('\n'), { loader: 'ts' });
  const deferred = [];
  const context = vm.createContext({
    console, Date, adminSupabase: db, ...parser, ...metadataModule, ...sync, ...queueModule, ...policy, ...partner,
    isRecord: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    normalizePhoneLike: (value) => typeof value === 'string' ? value.replace(/\D/g, '') || null : null,
    normalizeOptionalString: (value) => typeof value === 'string' ? value.trim() || null : null,
    normalizeOptionalIdentifier: (value) => typeof value === 'string' ? value.trim() || null : null,
    sanitizeReusableMetaSetupValue: (value) => value,
    getMetaChannelMetadata: (row) => row.metadata || {},
    coexistenceWebhookQueue: { defer: async (input) => deferred.push(clone(input)) },
    // These existing live side effects must never be invoked during import.
    upsertThread() { throw new Error('Live upsertThread invoked'); }, insertMessage() { throw new Error('Live insertMessage invoked'); },
    createIncomingMessageNotification() { throw new Error('Notification invoked'); },
    processAutomationRulesForIncomingMessage() { throw new Error('Automation invoked'); },
    ...overrides,
  });
  vm.runInContext(code.code, context);
  return { context, deferred };
}
const job = (field, payload) => ({ id: 'job', waba_id: '123', phone_number_id: '456', field, entry_time: null, payload, attempts: 1 });

test('actual import persists historical inbound once, preserves live preview/unread and completes request metadata', async () => {
  const db = database({ meta_channels: [channel], conversation_threads: [{ id: 'thread', user_id: 'owner', contact_wa_id: customer,
    unread_count: 7, last_message_at: '2026-10-17T00:00:00.000Z', last_message_text: 'New live message',
    contact_name: 'CRM name', attributes: { consent: true }, labels: ['VIP'] }] });
  const { context } = await sandbox(db);
  await context.processCoexistenceWebhookJob(job('history', history()), async () => {});
  await context.processCoexistenceWebhookJob(job('history', history()), async () => {});
  assert.equal(db.tables.conversation_messages.length, 1);
  const stored = db.tables.conversation_messages[0];
  assert.equal(stored.direction, 'inbound');
  assert.equal(stored.raw.connektly_coexistence.historical, true);
  assert.equal(stored.created_at, '2025-02-11T00:49:15.000Z');
  assert.equal(db.tables.conversation_threads[0].unread_count, 7);
  assert.equal(db.tables.conversation_threads[0].last_message_text, 'New live message');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSync.history.status, 'completed');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSync.history.requestId, 'request-1');
});

test('out-of-order media is durably deferred then hydrates original message without changing direction', async () => {
  const db = database({ meta_channels: [channel] });
  const { context, deferred } = await sandbox(db);
  const media = { metadata, messages: [{ ...rawMessage('wamid.media', 'image'), image: { id: 'media', caption: 'Photo' } }] };
  await context.processCoexistenceWebhookJob(job('history', media), async () => {});
  assert.equal(deferred.length, 1);
  assert.equal(db.tables.conversation_messages.length, 0);
  const placeholder = { ...rawMessage('wamid.media', 'media_placeholder'), from: metadata.display_phone_number };
  await context.processCoexistenceWebhookJob(job('history', history(placeholder)), async () => {});
  await context.processCoexistenceWebhookJob(job('coexistence_deferred', { channelId: 'channel', message: deferred[0].message }), async () => {});
  assert.equal(db.tables.conversation_messages.length, 1);
  assert.equal(db.tables.conversation_messages[0].direction, 'outbound');
  assert.equal(db.tables.conversation_messages[0].message_type, 'image');
  assert.equal(db.tables.conversation_messages[0].body, 'Photo');
  assert.equal(db.tables.conversation_threads[0].last_message_text, 'Photo');
  assert.equal(db.tables.conversation_threads[0].unread_count, 0);
});

test('actual contact removal keeps CRM data and does not create missing CRM contacts', async () => {
  const db = database({ meta_channels: [channel], conversation_threads: [{ id: 'thread', user_id: 'owner', contact_wa_id: customer,
    contact_name: 'CRM override', unread_count: 4, attributes: { consent: 'yes' }, labels: ['VIP'], email: 'crm@example.test' }] });
  const { context } = await sandbox(db);
  const payload = { metadata, state_sync: [{ type: 'contact', action: 'remove', metadata: { timestamp: '1749854575' }, contact: { phone_number: customer } },
    { type: 'contact', action: 'remove', metadata: { timestamp: '1749854575' }, contact: { phone_number: '12125557890' } }] };
  await context.processCoexistenceWebhookJob(job('smb_app_state_sync', payload), async () => {});
  assert.equal(db.tables.conversation_threads.length, 1);
  const row = db.tables.conversation_threads[0];
  assert.equal(row.contact_name, 'CRM override');
  assert.equal(row.email, 'crm@example.test');
  assert.deepEqual(row.labels, ['VIP']);
  assert.equal(row.unread_count, 4);
  assert.equal(row.attributes.consent, 'yes');
  assert.equal(row.attributes.whatsappBusinessAppContact.active, false);
});

test('account lifecycle scopes WABA+number, rejects stale events and retains claims/token across reconnect', async () => {
  const other = { ...clone(channel), id: 'other', phone_number_id: '789', display_phone_number: '15550000000' };
  const db = database({ meta_channels: [channel, other] });
  const { context } = await sandbox(db);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_OFFBOARDED' }, '2026-10-17T00:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'connected', 'Ambiguous no-number event must not disconnect every WABA sender');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_OFFBOARDED', phone_number: metadata.display_phone_number }, '2026-10-17T00:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'disconnected');
  assert.equal(db.tables.meta_channels[1].status, 'connected');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_RECONNECTED', phone_number_id: '456' }, '2026-10-17T01:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'connected');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSync.history.requestId, 'request-1');
  assert.equal(db.tables.meta_channels[0].access_token_ciphertext, 'preserve-token');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_OFFBOARDED', phone_number_id: '456' }, '2026-10-17T00:30:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'connected');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number_id: '456' }, '2026-10-17T02:00:00.000Z');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_RECONNECTED', phone_number_id: '456' }, '2026-10-17T03:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'disconnected', 'Permanent partner removal requires signup');
  assert.equal(db.tables.meta_channels[0].metadata.coexistence.lifecycle.partnerRemovedAt, '2026-10-17T02:00:00.000Z');
});

test('durable queue stores without processing, deduplicates, retries failures and recovers leased jobs', async () => {
  const db = database();
  let calls = 0, fail = true;
  const queue = queueModule.createCoexistenceWebhookQueue({ supabase: db, workerId: 'worker', processJob: async () => {
    calls++; if (fail) throw new queueModule.CoexistenceWebhookRetry('Waiting for original', 60);
  } });
  const input = { wabaId: '123', phoneNumberId: '456', field: 'history', payload: history() };
  await queue.enqueue(input);
  await queue.enqueue(input);
  assert.equal(calls, 0, 'HTTP may acknowledge the durable insert before starting ingestion');
  assert.equal(db.tables.whatsapp_coexistence_webhook_jobs.length, 1);
  await queue.drainOnce();
  const row = db.tables.whatsapp_coexistence_webhook_jobs[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
  assert.equal(row.last_error, 'Waiting for original');
  row.status = 'processing'; row.leaseExpired = true; row.notDue = false; row.locked_by = 'dead-worker';
  fail = false;
  await queue.drainOnce();
  assert.equal(row.status, 'completed');
  assert.equal(row.attempts, 2);
  await queue.enqueue(input);
  assert.equal(row.status, 'completed', 'Webhook retries cannot reset a completed durable job');
});

test('a manual re-onboarding timestamp rejects delayed removals even when lifecycle marker is absent', async () => {
  const fresh = clone(channel);
  fresh.metadata.coexistence = { onboardedAt: '2026-10-17T02:00:00.000Z' };
  fresh.metadata.coexistenceSync.onboardedAt = '2026-10-17T02:00:00.000Z';
  const db = database({ meta_channels: [fresh] });
  const { context } = await sandbox(db);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number_id: '456' }, '2026-10-17T01:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].status, 'connected');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number_id: '456' }, null);
  assert.equal(db.tables.meta_channels[0].status, 'connected');
});

function activeWithArchivedPhone() {
  const current = clone(channel);
  current.waba_id = '999'; current.phone_number_id = '888'; current.display_phone_number = '15550008888';
  current.metadata.coexistenceSync.onboardingId = 'new-active-onboarding';
  current.metadata.coexistenceSyncByPhone = { '456': {
    wabaId: '123', displayPhoneNumber: metadata.display_phone_number,
    coexistence: clone(channel.metadata.coexistence), sync: clone(channel.metadata.coexistenceSync),
  } };
  return current;
}

test('archived phone display-number removal updates its registry across WABA switches without disconnecting active sender', async () => {
  const current = activeWithArchivedPhone();
  const db = database({ meta_channels: [current] });
  const { context } = await sandbox(db);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number: metadata.display_phone_number }, '2026-10-17T01:00:00.000Z');
  const row = db.tables.meta_channels[0];
  assert.equal(row.status, 'connected');
  assert.equal(row.access_token_ciphertext, 'preserve-token');
  assert.equal(row.metadata.coexistence.lifecycle.event, 'ONBOARDED');
  assert.equal(row.metadata.coexistenceSync.onboardingId, 'new-active-onboarding');
  const archived = row.metadata.coexistenceSyncByPhone['456'];
  assert.equal(archived.coexistence.lifecycle.partnerRemovedAt, '2026-10-17T01:00:00.000Z');
  assert.equal(archived.sync.history.requestId, 'request-1');
  const restored = metadataModule.mergeMetaChannelSaveMetadata({ existingRow: row, setupType: 'coexistence', wabaId: '123', phoneNumberId: '456',
    metadataPatch: { coexistence: { isOnBizApp: true, lifecycle: { event: 'ONBOARDED', eventAt: '2026-10-17T02:00:00.000Z' } },
      coexistenceSync: { onboardingId: 'fresh-after-removal', onboardedAt: '2026-10-17T02:00:00.000Z', contacts: { status: 'not_requested' }, history: { status: 'not_requested' } } } });
  assert.equal(restored.coexistenceSync.onboardingId, 'fresh-after-removal', 'Confirmed inactive-number removal permits a new legitimate signup lifecycle');
  assert.equal(restored.coexistenceSync.history.status, 'not_requested');
  assert.equal(restored.coexistenceSyncHistory[0].history.requestId, 'request-1');
});

test('archived exact phone-ID offboard/reconnect preserves claims and rejects stale or wrong-WABA lifecycle events', async () => {
  const db = database({ meta_channels: [activeWithArchivedPhone()] });
  const { context } = await sandbox(db);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_OFFBOARDED', phone_number_id: '456' }, '2026-10-17T01:00:00.000Z');
  let archived = db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['456'];
  assert.equal(archived.coexistence.lifecycle.event, 'ACCOUNT_OFFBOARDED');
  assert.equal(archived.coexistence.lifecycle.reconnecting, true);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_RECONNECTED', phone_number_id: '456' }, '2026-10-17T02:00:00.000Z');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number_id: '456' }, '2026-10-17T00:00:00.000Z');
  await context.handleWhatsAppAccountUpdateWebhook('999', { event: 'PARTNER_REMOVED', phone_number_id: '456' }, '2026-10-17T03:00:00.000Z');
  archived = db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['456'];
  assert.equal(archived.coexistence.lifecycle.event, 'ACCOUNT_RECONNECTED');
  assert.equal(archived.sync.history.requestId, 'request-1');
  assert.equal(db.tables.meta_channels[0].status, 'connected');
});

test('WABA-only archived events apply only to one unambiguous phone; display identity scopes multiple archived phones', async () => {
  const current = activeWithArchivedPhone();
  const db = database({ meta_channels: [current] });
  const { context } = await sandbox(db);
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'ACCOUNT_OFFBOARDED' }, '2026-10-17T01:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['456'].coexistence.lifecycle.event, 'ACCOUNT_OFFBOARDED');
  db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['777'] = {
    wabaId: '123', displayPhoneNumber: '15550007777', coexistence: clone(channel.metadata.coexistence), sync: clone(channel.metadata.coexistenceSync),
  };
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED' }, '2026-10-17T02:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['456'].coexistence.lifecycle.event, 'ACCOUNT_OFFBOARDED');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['777'].coexistence.lifecycle.event, 'ONBOARDED');
  await context.handleWhatsAppAccountUpdateWebhook('123', { event: 'PARTNER_REMOVED', phone_number: '15550007777' }, '2026-10-17T03:00:00.000Z');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['777'].coexistence.lifecycle.event, 'PARTNER_REMOVED');
  assert.equal(db.tables.meta_channels[0].metadata.coexistenceSyncByPhone['456'].coexistence.lifecycle.event, 'ACCOUNT_OFFBOARDED');
  assert.equal(db.tables.meta_channels[0].status, 'connected');
});

test('deferred hydration changes with the same wamid retain separate durable payloads', async () => {
  const db = database();
  const queue = queueModule.createCoexistenceWebhookQueue({ supabase: db, processJob: async () => {} });
  const first = parser.parseCoexistenceWebhook('history', { metadata, messages: [{ ...rawMessage('wamid.media', 'image'), image: { id: '1' } }] }).messages[0];
  const second = parser.parseCoexistenceWebhook('history', { metadata, messages: [{ ...rawMessage('wamid.media', 'image'), image: { id: '2' } }] }).messages[0];
  await queue.defer({ wabaId: '123', phoneNumberId: '456', channelId: 'channel', message: first });
  await queue.defer({ wabaId: '123', phoneNumberId: '456', channelId: 'channel', message: first });
  await queue.defer({ wabaId: '123', phoneNumberId: '456', channelId: 'channel', message: second });
  assert.equal(db.tables.whatsapp_coexistence_webhook_jobs.length, 2);
});

test('display-name webhook preserves concurrent once-only claims and lifecycle metadata', async () => {
  const db = database({ meta_channels: [channel] });
  let registrationRow;
  const { context } = await sandbox(db, {
    getDisplayNameStatus: (value) => value,
    findMetaChannelForPhoneNumberNameUpdate: async () => clone(channel),
    decryptAccessToken: () => 'token',
    fetchPhoneNumber: async () => {
      db.tables.meta_channels[0].metadata.coexistenceSync.history.status = 'declined';
      db.tables.meta_channels[0].metadata.coexistence.lifecycle = { event: 'PARTNER_REMOVED', eventAt: '2026-10-17T00:00:00.000Z' };
      db.tables.meta_channels[0].status = 'disconnected';
      return { verified_name: 'Approved name', display_phone_number: metadata.display_phone_number };
    },
    getMetaChannelMetadataRecord: (row) => row.metadata,
    getNormalizedMessagingLimitTier: () => null,
    isRejectedDisplayNameStatus: () => false,
    createDisplayNameReviewNotification: async () => {},
    maybeAutoRegisterApprovedDisplayName: async (args) => { registrationRow = args.row; },
  });
  await context.handlePhoneNumberNameUpdateWebhook({ entryId: '123', value: { decision: 'APPROVED', display_phone_number: metadata.display_phone_number } });
  const row = db.tables.meta_channels[0];
  assert.equal(row.metadata.coexistenceSync.history.status, 'declined');
  assert.equal(row.metadata.coexistenceSync.history.requestId, 'request-1');
  assert.equal(row.metadata.coexistence.lifecycle.event, 'PARTNER_REMOVED');
  assert.equal(row.status, 'disconnected');
  assert.equal(registrationRow.status, 'disconnected');
  assert.equal(row.metadata.displayNameApproval.status, 'APPROVED');
});

test('signed webhook acknowledges only after durable enqueue and returns 500 when storage fails', async () => {
  const names = ['timingSafeCompareHex', 'processWhatsAppWebhookPayload'];
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  const route = ast.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    node.expression.expression.name?.text === 'post' && node.expression.arguments[0]?.text === '/api/meta/webhook');
  const code = await transform([...functions, route].map((node) => node.getText(ast)).join('\n'), { loader: 'ts' });
  let handler, fail = false;
  const events = [];
  const context = vm.createContext({
    console, crypto, Buffer, metaAppSecret: 'secret', ...parser,
    isRecord: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    normalizeOptionalIdentifier: (value) => typeof value === 'string' ? value : null,
    coexistenceWebhookQueue: { enqueue: async () => { events.push('durable'); if (fail) throw new Error('Storage unavailable'); }, kick: () => events.push('process') },
    app: { post: (_path, callback) => { handler = callback; } },
    sendError: (res, status, error) => res.status(status).json({ error: error.message }),
  });
  vm.runInContext(code.code, context);
  const body = { entry: [{ id: '123', changes: [{ field: 'history', value: history() }] }] };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${crypto.createHmac('sha256', 'secret').update(rawBody).digest('hex')}`;
  const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json() { events.push('ack'); } });
  const res = response();
  await handler({ body, rawBody, get: () => signature }, res);
  assert.deepEqual(events, ['durable', 'ack', 'process']);
  events.length = 0; fail = true;
  const failed = response();
  await handler({ body, rawBody, get: () => signature }, failed);
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(events, ['durable', 'ack'], 'Failed durable writes must not launch processing or return 200');
});

test('partner history reconciles the Meta wamid alias with an existing Gupshup outgoing message', async () => {
  const linkedChannel = clone(channel);
  linkedChannel.metadata.partnerSolution = { id: '1287084176407435' };
  const db = database({ meta_channels: [linkedChannel], conversation_threads: [{ id: 'thread', user_id: 'owner', contact_wa_id: customer,
    last_message_at: '2026-10-17T00:00:00Z', last_message_text: 'Current', unread_count: 0 }],
    conversation_messages: [{ id: 'message', user_id: 'owner', thread_id: 'thread', wa_message_id: 'gs-uuid', direction: 'outbound',
      message_type: 'text', body: 'Original', status: 'read', created_at: '2025-02-11T00:00:00Z', raw: { gupshup_whatsapp_message_id: 'wamid.alias' } }] });
  const { context } = await sandbox(db);
  const outgoing = { ...rawMessage('wamid.alias'), history_context: { from_me: true, status: 'SENT' } };
  const parsed = parser.parseCoexistenceWebhook('history', history(outgoing), linkedChannel.display_phone_number).messages[0];
  await context.persistCoexistenceMessage(linkedChannel, parsed);
  assert.equal(db.tables.conversation_messages.length, 1);
  assert.equal(db.tables.conversation_messages[0].wa_message_id, 'gs-uuid');
  assert.equal(db.tables.conversation_messages[0].status, 'read');
});
