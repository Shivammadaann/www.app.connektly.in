import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['server/coexistence-webhooks.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
});
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, Date, Set, Map });
const {
  parseCoexistenceWebhook: parse,
  mergeCoexistenceMessage: merge,
  mergeCoexistenceHistoryState: mergeHistory,
  mergeCoexistenceContactAttributes: mergeContact,
  coexistenceTimestamp,
} = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

const business = '15550783881';
const customer = '16505551234';
const metadata = { phone_number_id: '106540352242922', display_phone_number: business };
const text = (id = 'wamid.text', from = business, status = 'READ') => ({
  from, id, timestamp: '1739230955', type: 'text', text: { body: 'Hello' }, history_context: { status },
});
function history(messages, meta = { phase: 0, chunk_order: 1, progress: 55 }) {
  return { metadata, history: [{ metadata: meta, threads: [{ id: customer, messages }] }] };
}
function parsedMessage(raw = text()) {
  return parse('history', history([raw])).messages[0];
}

test('Meta history payload separates historical inbound and outbound without to', () => {
  const parsed = parse('history', history([
    text('wamid.out'),
    { ...text('wamid.media'), type: 'media_placeholder', history_context: { status: 'PLAYED' } },
    text('wamid.in', customer),
  ]));
  assert.equal(parsed.handled, true);
  assert.deepEqual(plain(parsed.messages.map((message) => [message.direction, message.contactWaId, message.status])), [
    ['outbound', customer, 'read'], ['outbound', customer, 'played'], ['inbound', customer, 'read'],
  ]);
  assert.equal(parsed.messages[0].createdAt, '2025-02-10T23:42:35.000Z');
  assert.equal(parsed.messages[1].mediaPlaceholder, true);
  for (const message of parsed.messages) {
    assert.equal(message.historical, true);
    assert.equal(message.source, 'history');
    assert.equal(message.suppressSideEffects, true);
    assert.equal(message.affectsCustomerServiceWindow, false);
  }
});

test('Business app echoes are outbound and target to, never the business contact', () => {
  const echo = { ...text(), to: customer };
  delete echo.history_context;
  const parsed = parse('smb_message_echoes', { metadata, message_echoes: [echo] });
  assert.equal(parsed.handled, true);
  const message = parsed.messages[0];
  assert.equal(message.direction, 'outbound');
  assert.equal(message.contactWaId, customer);
  assert.equal(message.recipientWaId, customer);
  assert.equal(message.source, 'whatsapp_business_app');
  assert.equal(message.status, 'sent');
  assert.equal(message.historical, false);
  assert.equal(message.affectsCustomerServiceWindow, false);
  assert.equal(message.raw, echo, 'Original payload preserved');
});

test('missing IDs/recipients and group IDs cannot create imported CRM threads', () => {
  const parsed = parse('smb_message_echoes', { metadata, message_echoes: [
    text(), { ...text(), id: null, to: customer }, { ...text(), to: '1203-1234@g.us' },
  ] });
  assert.equal(parsed.messages.length, 0);
  assert.equal(parsed.warnings.length, 3);
  assert.equal(parse('history', { metadata, history: [{ threads: [{ id: '123@g.us', messages: [text()] }] }] }).messages.length, 0);
});

test('recognized history change is handled even if no history/messages are present', () => {
  assert.equal(parse('history', null).handled, true);
  assert.equal(parse('messages', { metadata, messages: [text()] }).handled, false);
  assert.equal(parse('messages', { metadata, messages: [text()] }).messages.length, 0);
});

test('standalone history media remains hydration-only despite misleading from', () => {
  const payload = { metadata, messages: [{
    from: customer, id: 'wamid.media', timestamp: '1738796547', type: 'image',
    image: { caption: 'Black Prince echeveria', mime_type: 'image/jpeg', id: '24230790383178626' },
  }] };
  const parsed = parse('history', payload);
  assert.equal(parsed.messages[0].direction, null);
  assert.equal(parsed.messages[0].hydrationOnly, true);
  assert.equal(parsed.messages[0].historical, true);
  assert.equal(merge(null, parsed.messages[0]), null, 'Out-of-order hydration must be durably queued, never inserted as inbound');
});

test('placeholder hydrates in place preserving original sender, direction, timestamp and status', () => {
  const placeholder = merge(null, parsedMessage({
    ...text('wamid.media'), type: 'media_placeholder', history_context: { status: 'PLAYED' },
  }));
  const media = parse('history', { metadata, messages: [{
    from: customer, id: 'wamid.media', timestamp: '1738796547', type: 'image', image: { id: 'media-id', caption: 'Plant' },
  }] }).messages[0];
  const hydrated = merge(placeholder, media);
  assert.equal(hydrated.message_type, 'image');
  assert.equal(hydrated.body, 'Plant');
  assert.equal(hydrated.direction, 'outbound');
  assert.equal(hydrated.sender_wa_id, business);
  assert.equal(hydrated.created_at, placeholder.created_at);
  assert.equal(hydrated.raw.from, business);
  assert.equal(hydrated.raw.timestamp, '1739230955');
  assert.equal(hydrated.status, 'played');
  assert.equal(hydrated.raw.image.id, 'media-id');
  assert.equal(hydrated.raw.connektly_coexistence.mediaPlaceholder, false);
  const replay = merge(hydrated, parsedMessage({ ...text('wamid.media'), type: 'media_placeholder' }));
  assert.deepEqual(plain(replay), plain(hydrated), 'Late/replayed placeholder must not regress media/status');
});

test('same historical message is idempotent and later lower statuses cannot regress READ', () => {
  const next = parsedMessage();
  const stored = merge(null, next);
  assert.deepEqual(plain(merge(stored, next)), plain(stored));
  assert.equal(merge(stored, parsedMessage(text('wamid.text', business, 'SENT'))).status, 'read');
  assert.equal(merge(stored, parsedMessage(text('wamid.text', business, 'ERROR'))).status, 'read');
  assert.equal(stored.raw.connektly_coexistence.historical, true);
  assert.equal(stored.raw.connektly_coexistence.affectsCustomerServiceWindow, false);
});

test('history replay retains live inbound eligibility without extending its original timestamp', () => {
  const live = {
    id: 'local', wa_message_id: 'wamid.text', direction: 'inbound', created_at: '2025-02-11T00:35:55.000Z',
    message_type: 'text', body: 'Hello', status: 'received', raw: text('wamid.text', customer),
  };
  const replay = merge(live, parsedMessage(text('wamid.text', customer)));
  assert.equal(replay.created_at, live.created_at);
  assert.equal(replay.raw.connektly_coexistence.historical, false);
  assert.equal(replay.raw.connektly_coexistence.affectsCustomerServiceWindow, true);
});

test('late history snapshots cannot downgrade a failed delivery to pending or sent', () => {
  const failed = merge(null, parsedMessage(text('wamid.failed', business, 'ERROR')));
  assert.equal(failed.status, 'failed');
  for (const status of ['PENDING', 'SENT']) {
    assert.equal(merge(failed, parsedMessage(text('wamid.failed', business, status))).status, 'failed');
  }
  assert.equal(merge(failed, parsedMessage(text('wamid.failed', business, 'DELIVERED'))).status, 'delivered');
});

test('Meta 2593109 is a consent decline, not a failed onboarding', () => {
  const parsed = parse('history', { metadata, history: [{ errors: [{
    code: 2593109, message: 'History sync is turned off by the business from the WhatsApp Business App',
  }] }] });
  assert.equal(parsed.messages.length, 0);
  assert.equal(parsed.historyUpdates[0].sharingDeclined, true);
  assert.equal(mergeHistory({}, parsed.historyUpdates).status, 'declined');
  assert.equal(mergeHistory({}, parsed.historyUpdates).sharingDeclined, true);
});

test('chunk progress is monotonic and tracks each phase independently', () => {
  const updates = (phase, chunk_order, progress) => parse('history', history([], { phase, chunk_order, progress })).historyUpdates;
  let state = mergeHistory({}, updates(2, 3, 95));
  assert.equal(state.status, 'syncing', 'Phase 2 is not sufficient for complete');
  state = mergeHistory(state, [...updates(0, 1, 10), ...updates(2, 1, 90), ...updates(2, 3, 95)]);
  assert.equal(state.progress, 95);
  assert.equal(state.phase, 2);
  assert.deepEqual(plain(state.receivedChunks), ['0:1', '2:1', '2:3']);
  state = mergeHistory(state, updates(1, 2, 100));
  assert.equal(state.status, 'completed');
  assert.equal(mergeHistory(state, updates(0, 2, 20)).status, 'completed');
});

test('history errors are retained and deduplicated across webhook retries', () => {
  const parsed = parse('history', { metadata, history: [{ errors: [{ code: 123, message: 'Try support' }] }] });
  let state = mergeHistory({}, parsed.historyUpdates);
  state = mergeHistory(state, parsed.historyUpdates);
  assert.equal(state.status, 'error');
  assert.equal(state.errors.length, 1);
});

test('contacts sync adds provenance without changing CRM attributes and removes no CRM data', () => {
  const parseContact = (action, timestamp, names = {}) => parse('smb_app_state_sync', { metadata, state_sync: [{
    type: 'contact', action, contact: { phone_number: customer, ...names }, metadata: { timestamp },
  }] }).contacts[0];
  const existing = { vip: true, campaign: 'Summer', consent: 'explicit' };
  const added = mergeContact(existing, parseContact('add', '1738346006', { full_name: 'Pablo Morales', first_name: 'Pablo' }));
  assert.deepEqual(plain(existing), { vip: true, campaign: 'Summer', consent: 'explicit' });
  assert.equal(added.whatsappBusinessAppContact.fullName, 'Pablo Morales');
  assert.equal(added.whatsappBusinessAppContact.active, true);
  const removed = mergeContact(added, parseContact('remove', '1738346007'));
  assert.equal(removed.whatsappBusinessAppContact.active, false);
  assert.equal(removed.whatsappBusinessAppContact.fullName, 'Pablo Morales');
  assert.equal(removed.consent, 'explicit');
  assert.equal(removed.vip, true);
  assert.deepEqual(plain(mergeContact(removed, parseContact('add', '1738346006', { full_name: 'Old name' }))), plain(removed));
  assert.deepEqual(plain(mergeContact(removed, parseContact('add', '1738346007', { full_name: 'Old name' }))), plain(removed));
});

test('Meta edits/revokes mutate original wamid and keep chronological position', () => {
  const original = merge(null, parsedMessage(text('wamid.original', customer)));
  function mutation(type, timestamp = '1749854575', body = 'Edited') {
    const raw = { from: customer, id: `wamid.${type}.${timestamp}`, timestamp, type,
      [type]: { original_message_id: 'wamid.original', ...(type === 'edit' ? { message: { type: 'text', text: { body } } } : {}) },
    };
    return parse('messages', { metadata, messages: [raw] }).messages[0];
  }
  const edit = mutation('edit');
  assert.equal(edit.direction, 'inbound');
  assert.equal(edit.mutation.originalMessageId, 'wamid.original');
  assert.equal(merge(null, edit), null, 'Unknown originals must queue');
  const edited = merge(original, edit);
  assert.equal(edited.wa_message_id, 'wamid.original');
  assert.equal(edited.created_at, original.created_at);
  assert.equal(edited.body, 'Edited');
  assert.equal(merge(edited, mutation('edit', '1749854574', 'Earlier')).body, 'Edited');
  const revoked = merge(edited, mutation('revoke', '1749854576'));
  assert.equal(revoked.message_type, 'revoke');
  assert.equal(revoked.raw.text, undefined, 'Deleted content no longer rendered');
  assert.equal(merge(revoked, mutation('edit', '1749854577', 'Replay')).body, 'This message was deleted');
  assert.equal(merge(revoked, parsedMessage(text('wamid.original', customer))).body, 'This message was deleted');
});

test('invalid timestamps and invalid progress never become current-time inbound events', () => {
  for (const value of [null, '', 'garbage', 'Infinity', Infinity, -1, {}, '99999999999999999999']) {
    assert.equal(coexistenceTimestamp(value), null);
  }
  const parsed = parse('history', history([{ ...text(), timestamp: 'bad' }], { phase: 9, chunk_order: -1, progress: 101 }));
  assert.equal(parsed.messages[0].createdAt, null);
  assert.deepEqual(plain(parsed.historyUpdates[0]), { phase: null, chunkOrder: null, progress: null, sharingDeclined: false, errors: [] });
});
