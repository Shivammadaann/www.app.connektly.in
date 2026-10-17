import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const sdk = await build({ entryPoints: ['src/lib/meta-sdk.ts'], bundle: true, write: false,
  format: 'iife', globalName: 'MetaSdk', define: { 'import.meta.env': '{}' } });
const helper = await build({ entryPoints: ['src/lib/whatsapp-onboarding.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'node' });
const helperModule = { exports: {} };
vm.runInNewContext(helper.outputFiles[0].text, { module: helperModule, exports: helperModule.exports });
const { getWhatsAppActivationIssue } = helperModule.exports;

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
  vm.runInContext(sdk.outputFiles[0].text, context);
  return { api: context.MetaSdk, logins, exchanges, listeners, timers,
    onCode(input) { exchanges.push(input); return Promise.resolve({ signupTicket: 'coex-ticket', expiresAt: '2099-01-01T00:00:00Z' }); },
    message(event, data) { listeners.get('message')?.({ origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event, data } }); },
  };
}

for (const order of ['code-first', 'assets-first']) {
  for (const withPhone of [false, true]) {
    test(`Coexistence signup completes ${order} with ${withPhone ? 'WABA and number' : 'WABA only'}`, async () => {
      const b = browser();
      await b.api.ensureMetaSdkReady();
      const pending = b.api.beginEmbeddedSignup({ setupType: 'coexistence', onCode: b.onCode });
      assert.equal(b.logins.length, 1, 'Open the Meta flow synchronously in the click handler');
      assert.equal(b.logins[0].options.extras.featureType, 'whatsapp_business_app_onboarding');
      assert.equal(b.logins[0].options.extras.version, 'v4');
      const data = { waba_id: '123', ...(withPhone ? { phone_number_id: '456' } : {}) };
      if (order === 'assets-first') b.message('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data);
      b.logins[0].callback({ authResponse: { code: 'one-time-code' } });
      assert.equal(b.exchanges.length, 1, 'Exchange the 30-second code without waiting for asset IDs');
      assert.equal(b.exchanges[0].setupType, 'coexistence', 'Bind the server ticket to the selected flow');
      if (order === 'code-first') b.message('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data);
      const session = await pending;
      assert.equal(session.setupType, 'coexistence');
      assert.equal(session.wabaId, '123');
      assert.equal(session.phoneNumberId, withPhone ? '456' : undefined);
      assert.equal(session.setupContext.event, 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING');
      assert.equal(b.listeners.size, 0);
      assert.equal(b.timers.size, 0);
    });
  }
}

test('Coexistence refuses standard finish events and malformed IDs, while exclusive keeps its old contract', async () => {
  for (const [event, data] of [
    ['FINISH', { waba_id: '123', phone_number_id: '456' }],
    ['FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: 'not-an-id' }],
    ['FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: '123', phone_number_id: 'invalid' }],
  ]) {
    const b = browser();
    await b.api.ensureMetaSdkReady();
    const pending = b.api.beginEmbeddedSignup({ setupType: 'coexistence', onCode: b.onCode });
    b.message(event, data);
    await assert.rejects(pending);
    assert.equal(b.exchanges.length, 0);
    assert.equal(b.listeners.size, 0);
  }
  const b = browser();
  await b.api.ensureMetaSdkReady();
  const pending = b.api.beginEmbeddedSignup({ onCode: b.onCode });
  assert.equal(b.logins[0].options.extras.featureType, undefined);
  b.logins[0].callback({ authResponse: { code: 'exclusive-code' } });
  assert.equal(b.exchanges[0].setupType, 'exclusive');
  b.message('FINISH', { waba_id: '123', phone_number_id: '456' });
  assert.equal((await pending).setupType, 'exclusive');
});

const channel = { id: 'channel-1', setupType: 'coexistence', connectionMethod: 'embedded_signup', status: 'connected', phoneNumberId: '456',
  displayPhoneNumber: '+1 555 123 4567', wabaId: '123', metadata: {
    coexistence: { isOnBizApp: true, platformType: 'CLOUD_API' },
    webhookSubscription: { isSubscribed: true },
    coexistenceSync: { onboardingId: 'onboarding-1', contacts: { status: 'pending' }, history: { status: 'pending', requestId: 'history-1' } },
  } };

test('Coexistence activation requires Meta verification and webhooks but never phone registration', () => {
  assert.equal(getWhatsAppActivationIssue(channel), null, 'Pending history is usable and must not request registration');
  assert.match(getWhatsAppActivationIssue({ ...channel, metadata: { ...channel.metadata,
    coexistence: { isOnBizApp: false, platformType: 'CLOUD_API' } } }), /not confirmed/);
  assert.match(getWhatsAppActivationIssue({ ...channel, metadata: { ...channel.metadata,
    webhookSubscription: { isSubscribed: false } } }), /webhook/);
  assert.match(getWhatsAppActivationIssue({ ...channel, metadata: { ...channel.metadata,
    coexistenceSync: { contacts: { status: 'pending' }, history: { status: 'unknown' } } } }), /Synchronization needs attention/);
});

const page = await build({
  entryPoints: ['src/pages/ChannelConnection.tsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', packages: 'external', loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'signup-test-context', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, ({ importer }) => importer.endsWith('ChannelConnection.tsx')
      ? { path: 'page-react', namespace: 'signup-test' } : { path: 'react', external: true });
    builder.onResolve({ filter: /(?:context\/AppDataContext|lib\/api|components\/ui\/ModalPortal|components\/OnboardingTopBar)$/ },
      ({ path }) => ({ path, namespace: 'signup-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'signup-test' }, ({ path }) => {
      if (path === 'page-react') return { contents: `
        import React from 'react';
        export const { useEffect, useMemo, useRef } = React;
        export function useState(initial) {
          const index = globalThis.hookIndex++;
          return React.useState(Object.prototype.hasOwnProperty.call(globalThis.stateOverrides, index)
            ? globalThis.stateOverrides[index] : initial);
        }` };
      if (path.endsWith('ModalPortal')) return { contents: 'export const APP_MODAL_LAYER_CLASS = "modal"; export default function Portal({children}) { return children; }' };
      if (path.endsWith('OnboardingTopBar')) return { contents: 'export default function TopBar() { return null; }' };
      if (path.endsWith('AppDataContext')) return { contents: 'export function useAppData() { return globalThis.dashboardData; }' };
      return { contents: 'export const appApi = new Proxy({}, { get() { return () => { throw new Error("Unexpected API request"); }; } });' };
    });
  } }],
});

function renderSignup(setupType, step, activeChannel = null) {
  const pageModule = { exports: {} };
  const context = { module: pageModule, exports: pageModule.exports, require, console, URL, URLSearchParams,
    hookIndex: 0, stateOverrides: { 0: setupType, 1: true, 2: step },
    dashboardData: { bootstrap: { channel: activeChannel, profile: null }, businessProfile: null },
  };
  vm.runInNewContext(page.outputFiles[0].text, context);
  const { MemoryRouter } = require('react-router-dom');
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(pageModule.exports.default)));
}

test('Coexistence signup explains app requirements and removes manual and registration recovery paths', () => {
  const readiness = renderSignup('coexistence', 1);
  assert.match(readiness, /Keep my WhatsApp Business app/);
  assert.match(readiness, /Use Cloud API only/);
  assert.match(readiness, /2\.24\.17/);
  assert.match(readiness, /QR code/);
  const connect = renderSignup('coexistence', 2, channel);
  assert.match(connect, /Check connection status/);
  assert.doesNotMatch(connect, /Use manual connection|Retry automatic activation|Review public profile/);
  assert.match(renderSignup('exclusive', 2), /Use manual connection/);
});

test('Coexistence final step shows billing with pending sync and bypasses profile editing', () => {
  const final = renderSignup('coexistence', 4, channel);
  assert.match(final, /Add your WhatsApp payment method/);
  assert.match(final, /Chat history: Waiting for Meta/);
  assert.match(final, /still synchronizing/);
  assert.match(final, /Step 3 of 3/);
  assert.doesNotMatch(final, /Save and continue|Your shared chat history has finished importing/);
  const declined = renderSignup('coexistence', 4, { ...channel, metadata: { ...channel.metadata,
    coexistenceSync: { contacts: { status: 'pending' }, history: { status: 'declined' } } } });
  assert.match(declined, /You chose not to share past chats/);
});

test('Device offboarding offers only status refresh while Meta reconnects the app automatically', () => {
  const reconnecting = renderSignup('coexistence', 2, { ...channel, status: 'disconnected', metadata: {
    ...channel.metadata, coexistence: { ...channel.metadata.coexistence,
      lifecycle: { event: 'ACCOUNT_OFFBOARDED', reconnecting: true } },
  } });
  assert.match(reconnecting, /Refresh current status/);
  assert.match(reconnecting, /does not need a new Meta signup/);
  assert.doesNotMatch(reconnecting, /Continue with Facebook|Check connection status|Authorize Facebook again/);
});

test('Manual or detected connections without an Embedded Signup lifecycle still launch Meta authorization', () => {
  const manual = renderSignup('coexistence', 2, { ...channel, connectionMethod: 'manual' });
  assert.doesNotMatch(manual, /Check connection status/);
  const missingLifecycle = renderSignup('coexistence', 2, { ...channel, metadata: {
    ...channel.metadata, coexistenceSync: { contacts: { status: 'pending' }, history: { status: 'pending' } },
  } });
  assert.doesNotMatch(missingLifecycle, /Check connection status/);
});
