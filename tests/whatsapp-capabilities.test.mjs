import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ['src/lib/whatsapp-capabilities.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'node',
});
const helperModule = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, { module: helperModule, exports: helperModule.exports });
const { getWhatsAppCapabilities, isWhatsAppCoexistence, getWhatsAppCoexistenceSync, getWhatsAppCoexistenceLifecycle } = helperModule.exports;
const exclusive = { setupType: 'exclusive', metadata: {} };
const coexistence = { setupType: 'coexistence', metadata: {} };

test('Exclusive Cloud API numbers retain phone management, profile, and calling capabilities', () => {
  const capabilities = getWhatsAppCapabilities(exclusive);
  assert.equal(capabilities.isCoexistence, false);
  assert.equal(capabilities.maxMessagesPerSecond, null, 'Do not invent a fixed Cloud API limit');
  for (const permission of ['canRegisterSender', 'canDeregisterSender', 'canVerifyPhone',
    'canManageTwoStepVerification', 'canEditBusinessProfile', 'canManageCommerceSettings', 'canUseCallingApi']) {
    assert.equal(capabilities[permission], true, permission);
    assert.equal(getWhatsAppCapabilities(coexistence)[permission], false, `Coexistence: ${permission}`);
    assert.equal(getWhatsAppCapabilities(null)[permission], false, `No channel: ${permission}`);
  }
  assert.equal(getWhatsAppCapabilities(coexistence).maxMessagesPerSecond, 20);
});

test('Meta-detected Business app numbers receive restrictions even on older connection records', () => {
  for (const metadata of [
    { coexistence: { isOnBizApp: true, platformType: 'CLOUD_API' } },
    { isOnBizApp: true }, { is_on_biz_app: true }, { phoneNumber: { is_on_biz_app: true } },
  ]) {
    const channel = { setupType: null, metadata };
    assert.equal(isWhatsAppCoexistence(channel), true);
    assert.equal(getWhatsAppCapabilities(channel).canDeregisterSender, false);
    assert.equal(getWhatsAppCapabilities(channel).canUseCallingApi, false);
  }
  assert.equal(isWhatsAppCoexistence({ setupType: 'exclusive', metadata: { isOnBizApp: 'false' } }), false);
  assert.equal(isWhatsAppCoexistence({ setupType: 'exclusive', metadata: { coexistence: null } }), false);
});

test('Accepted and interrupted sync requests stay incomplete until webhook confirmation', () => {
  for (const status of ['requested', 'pending', 'unknown']) {
    const sync = getWhatsAppCoexistenceSync({ ...coexistence, metadata: {
      coexistenceSync: { contacts: { status }, history: { status, requestId: 'support-123', progress: 100 } },
    } });
    assert.equal(sync.history.status, status, 'Even a stale progress value cannot complete the import');
    assert.notEqual(sync.history.label, 'Complete');
    assert.equal(sync.history.requestId, 'support-123');
  }
});

test('Declined history sharing remains distinct from completed history and retryable failures', () => {
  const sync = getWhatsAppCoexistenceSync({ ...coexistence, metadata: {
    coexistenceSync: { contacts: { status: 'pending' }, history: { status: 'declined' } },
  } });
  assert.equal(sync.history.label, 'History sharing declined');
  assert.equal(sync.history.needsRecovery, false);
  assert.equal(sync.contacts.status, 'pending', 'One contact webhook cannot prove initial import completion');
  assert.equal(getWhatsAppCoexistenceSync(exclusive), null);
});

test('Only explicit completed state finishes sync; malformed states stay visible for recovery', () => {
  const sync = getWhatsAppCoexistenceSync({ ...coexistence, metadata: {
    coexistenceSync: { contacts: { status: 'unexpected', progress: Number.NaN }, history: { status: 'completed', progress: 100 } },
  } });
  assert.equal(sync.history.label, 'Complete');
  assert.equal(sync.contacts.status, 'unknown');
  assert.equal(sync.contacts.needsRecovery, true);
  assert.equal(sync.contacts.progress, null);
  const initial = getWhatsAppCoexistenceSync(coexistence);
  assert.equal(initial.history.status, 'not_requested');
});

test('Legacy sync request evidence never presents an import as unrequested', () => {
  for (const operation of [{ requestId: 'request-1' }, { request_id: 'request-1' },
    { requestedAt: '2026-10-17T00:00:00Z' }, { status: 'not_requested', requestId: 'request-1' }]) {
    const sync = getWhatsAppCoexistenceSync({ ...coexistence, metadata: { coexistenceSync: { history: operation } } });
    assert.equal(sync.history.status, 'unknown');
    assert.equal(sync.history.needsRecovery, true);
  }
  const legacy = getWhatsAppCoexistenceSync({ ...coexistence, metadata: {
    coexistenceSync: { history: { state: 'pending', request_id: 'legacy-request' } },
  } });
  assert.equal(legacy.history.status, 'pending');
  assert.equal(legacy.history.requestId, 'legacy-request');
});

test('Device reconnection is distinct from customer removal and account reconnection', () => {
  for (const [event, reconnecting, expected] of [
    ['ACCOUNT_OFFBOARDED', true, true], ['PARTNER_REMOVED', false, false], ['ACCOUNT_RECONNECTED', false, false],
  ]) {
    const value = getWhatsAppCoexistenceLifecycle({ ...coexistence, metadata: {
      coexistence: { lifecycle: { event, reconnecting } },
    } });
    assert.equal(value.isReconnecting, expected);
  }
});

const pageBundles = await Promise.all(['Calls', 'BusinessProfile', 'Channels', 'Catalog'].map(async (name) => {
  const output = await build({
    entryPoints: [`src/pages/dashboard/${name}.tsx`], bundle: true, write: false,
    format: 'cjs', platform: 'node', packages: 'external', loader: { '.png': 'dataurl', '.svg': 'dataurl' },
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'dashboard-test-context',
      setup(builder) {
        builder.onResolve({ filter: /(?:context\/(?:AppDataContext|CallManagerContext)|lib\/api)$/ },
          ({ path }) => ({ path, namespace: 'test-context' }));
        builder.onLoad({ filter: /.*/, namespace: 'test-context' }, ({ path }) => ({ contents:
          path.endsWith('AppDataContext')
            ? 'export function useAppData() { return globalThis.dashboardData; }'
            : path.endsWith('CallManagerContext')
              ? 'export function useCallManager() { return { startOutgoingCall() {}, isCallActionPending: false }; }'
              : 'export const appApi = new Proxy({}, { get() { return () => { throw new Error("Unexpected API request during rendering"); }; } });',
        }));
      },
    }],
  });
  return [name, output.outputFiles[0].text];
}));

function renderPage(name, setupType, metadata = {}) {
  const pageModule = { exports: {} };
  const dashboardData = {
    bootstrap: { channel: { ...exclusive, setupType, status: 'connected', metadata,
      phoneNumberId: '123', displayPhoneNumber: '+1 555 123 4567' }, profile: null },
    businessProfile: null, isBusinessProfileLoading: false,
  };
  const context = { module: pageModule, exports: pageModule.exports, require,
    console, URL, URLSearchParams, dashboardData };
  vm.runInNewContext(pageBundles.find(([page]) => page === name)[1], context);
  const { MemoryRouter } = require('react-router-dom');
  return renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(pageModule.exports.default)));
}

test('Coexistence dashboard pages replace unavailable call and profile actions with app guidance', () => {
  const calls = renderPage('Calls', 'coexistence');
  assert.match(calls, /Use WhatsApp Business for calls/);
  assert.doesNotMatch(calls, /New WhatsApp Call|Call Settings/);
  const profile = renderPage('BusinessProfile', 'coexistence');
  assert.match(profile, /Manage your profile in WhatsApp Business/);
  assert.doesNotMatch(profile, /Save Changes|Change photo|Sync from Meta/);
  const channels = renderPage('Channels', 'coexistence', { coexistenceSync: {
    contacts: { status: 'pending', requestId: 'contacts-1' }, history: { status: 'declined' },
  } });
  assert.match(channels, /20 messages per second/);
  assert.match(channels, /History sharing declined/);
  assert.match(channels, /contacts-1/);
  assert.match(channels, /Business Platform/);
  assert.doesNotMatch(channels, /Enable two-step verification|Change PIN|Auto-registering/);
  const catalog = renderPage('Catalog', 'coexistence');
  assert.match(catalog, /app features do not synchronize/);
  assert.match(catalog, /Create Catalog/, 'Separate Meta catalog management remains available');
  assert.doesNotMatch(catalog, /Save Commerce Settings|Enable cart in WhatsApp|Show catalog in WhatsApp/);
  const reconnecting = renderPage('Channels', 'coexistence', {
    coexistence: { lifecycle: { event: 'ACCOUNT_OFFBOARDED', reconnecting: true } },
  });
  assert.match(reconnecting, /Refresh current status/);
  assert.match(reconnecting, /a new signup or initial import is not needed/);
  assert.doesNotMatch(reconnecting, /How to disconnect|Edit Business Profile/);
});

test('Cloud API dashboard pages keep the existing calls, profile, and PIN controls', () => {
  assert.match(renderPage('Calls', 'exclusive'), /New WhatsApp Call/);
  assert.match(renderPage('BusinessProfile', 'exclusive'), /Save Changes/);
  assert.match(renderPage('Channels', 'exclusive'), /Enable two-step verification/);
  assert.match(renderPage('Catalog', 'exclusive'), /Save Commerce Settings/);
});
