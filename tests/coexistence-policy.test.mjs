import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { test } from 'node:test';
import { build, transform } from 'esbuild';
import ts from 'typescript';

async function moduleAt(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'cjs', platform: 'node' });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, setTimeout, console });
  return module.exports;
}
const { opensCustomerServiceWindow } = await moduleAt('src/lib/customer-service-window.ts');
const { isCoexistenceChannelRow, coexistenceRestrictedAction } = await moduleAt('server/coexistence-policy.ts');
const { createCoexistenceSendLimiter, whatsappSendPhoneId } = await moduleAt('server/coexistence-rate-limit.ts');
const { claimLiveWhatsAppMessage } = await moduleAt('server/coexistence-live-message.ts');

test('live inbound alone opens the reply window, including a live message later matched by history', () => {
  const message = { direction: 'inbound', messageType: 'text', raw: {} };
  assert.equal(opensCustomerServiceWindow(message), true);
  for (const marker of [{ historical: true }, { affectsCustomerServiceWindow: false }]) {
    assert.equal(opensCustomerServiceWindow({ ...message, raw: { connektly_coexistence: marker } }), false);
  }
  assert.equal(opensCustomerServiceWindow({ ...message, raw: { connektly_coexistence: { historical: false, affectsCustomerServiceWindow: true } } }), true);
  assert.equal(opensCustomerServiceWindow({ ...message, direction: 'outbound' }), false);
  assert.equal(opensCustomerServiceWindow({ ...message, messageType: 'call_summary' }), false);
});

test('coexistence policy covers registration, account controls, calling, and app offboarding', () => {
  assert.equal(isCoexistenceChannelRow({ setup_type: 'coexistence' }), true);
  assert.equal(isCoexistenceChannelRow({ setup_type: 'exclusive', metadata: { coexistence: { isOnBizApp: true } } }), true);
  assert.equal(isCoexistenceChannelRow({ setup_type: 'exclusive' }), false);
  for (const path of ['/api/meta/channel/register', '/api/meta/channel/deregister', '/api/meta/channel/request-code',
    '/api/meta/channel/verify-code', '/api/meta/channel/two-step-verification', '/api/meta/business-profile/photo',
    '/api/meta/business-username', '/api/meta/display-name', '/api/meta/official-business-account',
    '/api/calls', '/api/calls/permissions/request', '/api/meta/call-settings']) {
    assert.ok(coexistenceRestrictedAction('POST', path), path);
  }
  assert.ok(coexistenceRestrictedAction('DELETE', '/api/meta/channel'));
  assert.ok(coexistenceRestrictedAction('DELETE', '/api/meta/channel/webhook-subscription/'));
  assert.equal(coexistenceRestrictedAction('POST', '/api/meta/channel/webhook-subscription'), null);
  assert.equal(coexistenceRestrictedAction('POST', '/api/meta/connect/embedded'), null);
  assert.equal(coexistenceRestrictedAction('POST', '/api/meta/templates'), null);
});

test('only WhatsApp Graph sends use the coexistence rate limiter', () => {
  const input = { path: '123/messages', method: 'POST', graphHost: 'graph.facebook.com', body: { messaging_product: 'whatsapp' } };
  assert.equal(whatsappSendPhoneId(input), '123');
  assert.equal(whatsappSendPhoneId({ ...input, path: '/123/marketing_messages' }), '123');
  assert.equal(whatsappSendPhoneId({ ...input, graphHost: 'graph.instagram.com' }), null);
  assert.equal(whatsappSendPhoneId({ ...input, body: { messaging_type: 'RESPONSE' } }), null);
  assert.equal(whatsappSendPhoneId({ ...input, method: 'GET' }), null);
});

test('concurrent sends share per-phone slots, failures release the queue, other phones stay independent', async () => {
  const attempts = new Map(), sleeps = [], successful = [];
  let active = 0, maxActive = 0;
  const wait = createCoexistenceSendLimiter({
    async claim(id) {
      active++; maxActive = Math.max(maxActive, active);
      await Promise.resolve(); active--;
      const attempt = (attempts.get(id) || 0) + 1; attempts.set(id, attempt);
      if (id === 'failed' && attempt === 1) throw new Error('Database unavailable');
      if (id === '123' && attempt % 2) return { acquired: false, retryAfterMs: 50 };
      successful.push(id); return { acquired: true, retryAfterMs: 0 };
    },
    sleep: async (ms) => { sleeps.push(ms); },
  });
  await Promise.all([wait('123'), wait('123'), wait('456')]);
  assert.equal(successful.filter(id => id === '123').length, 2);
  assert.deepEqual(sleeps, [50, 50]);
  assert.ok(maxActive > 1, 'Independent phones can proceed concurrently');
  await assert.rejects(wait('failed'), /Database unavailable/);
  await wait('failed');
});

test('actual server reply-window query excludes history before selecting latest inbound', async () => {
  const source = fs.readFileSync('server.ts', 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ensureConversationReplyWindowOpen');
  const calls = [], builder = {};
  for (const name of ['select', 'eq', 'neq', 'or', 'order']) builder[name] = (...args) => { calls.push([name, ...args]); return builder; };
  builder.limit = async () => ({ data: [], error: null });
  const code = await transform(fn.getText(ast), { loader: 'ts' });
  const sandbox = { adminSupabase: { from: () => builder }, normalizeOptionalString: value => value || null,
    getConversationThreadMessagingChannel: () => 'whatsapp', CUSTOMER_SERVICE_WINDOW_MS: 86400000 };
  vm.runInNewContext(code.code, sandbox);
  await assert.rejects(sandbox.ensureConversationReplyWindowOpen('owner', { id: 'thread' }), /approved template/);
  assert.ok(calls.some(call => call[0] === 'or' && call[1].includes('historical.neq.true')));
  assert.ok(calls.some(call => call[0] === 'or' && call[1].includes('affectsCustomerServiceWindow.neq.false')));
});

test('live WhatsApp message persistence retains Meta time instead of reopening a window at receipt time', async () => {
  const source = fs.readFileSync('server.ts', 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'insertMessage');
  const code = await transform(fn.getText(ast), { loader: 'ts' });
  let stored;
  const query = { insert(payload) { stored = payload; return this; }, select() { return this; }, async single() { return { data: stored }; } };
  const sandbox = { adminSupabase: { from: () => query }, mapMessage: row => row,
    dispatchDeveloperWebhookEvent: async () => {} };
  vm.runInNewContext(code.code, sandbox);
  const original = '2026-10-15T09:00:00.000Z';
  await sandbox.insertMessage({ userId: 'owner', threadId: 'thread', direction: 'inbound', messageType: 'text', createdAt: original });
  assert.equal(stored.created_at, original);
});

test('history-first live delivery is promoted once under concurrent live callbacks and hydration', async () => {
  const originalTime = '2026-10-17T10:00:00.000Z';
  const row = { id: 'row', user_id: 'owner', wa_message_id: 'wamid.1', direction: 'inbound', created_at: originalTime,
    raw: { image: { id: 'media' }, connektly_coexistence: { source: 'history', historical: true, affectsCustomerServiceWindow: false } } };
  let hydrationRace = true;
  const db = { from() {
    return {
      filters: [], payload: null,
      select() { return this; },
      eq(key, value) { this.filters.push([key, value]); return this; },
      update(payload) { this.payload = payload; return this; },
      async maybeSingle() {
        await Promise.resolve();
        if (!this.payload) return { data: JSON.parse(JSON.stringify(row)) };
        if (hydrationRace) { hydrationRace = false; row.raw.image.caption = 'Hydrated caption'; return { data: null }; }
        const rawFilter = this.filters.find(([key]) => key === 'raw')[1];
        if (JSON.stringify(row.raw) !== rawFilter) return { data: null };
        Object.assign(row, this.payload); return { data: { id: row.id } };
      },
    };
  } };
  const input = { supabase: db, userId: 'owner', messageId: 'wamid.1' };
  const results = await Promise.all([claimLiveWhatsAppMessage(input), claimLiveWhatsAppMessage(input)]);
  assert.equal(results.filter(value => value === 'promoted').length, 1);
  assert.equal(results.filter(value => value === 'duplicate').length, 1);
  assert.equal(row.raw.image.caption, 'Hydrated caption');
  assert.equal(row.created_at, originalTime);
  assert.equal(opensCustomerServiceWindow({ direction: row.direction, messageType: 'image', raw: row.raw }), true);
  assert.equal(await claimLiveWhatsAppMessage(input), 'duplicate');
});
