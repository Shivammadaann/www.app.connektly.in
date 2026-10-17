import { WHATSAPP_ONBOARDING_CONFIG_ID, clientConfig } from './config';
import { WHATSAPP_PARTNER_SOLUTION_ID } from './whatsapp-partner';
import type { EmbeddedMetaCodeExchangeInput, EmbeddedMetaCodeExchangeResponse, SetupType } from './types';

export type FacebookLoginStatus = 'connected' | 'not_authorized' | 'unknown';

export interface FacebookAuthResponse {
  accessToken: string;
  expiresIn: number;
  signedRequest: string;
  userID: string;
}

export interface FacebookLoginStatusResponse {
  status: FacebookLoginStatus;
  authResponse?: FacebookAuthResponse;
}

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      AppEvents: {
        logPageView: () => void;
      };
      getLoginStatus: (callback: (response: FacebookLoginStatusResponse) => void) => void;
      XFBML: {
        parse: (element: HTMLElement) => void;
      };
      login: (
        callback: (response: {
          status?: string;
          authResponse?: {
            code?: string;
            accessToken?: string;
          };
        }) => void,
        options?: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
    connektlyFacebookLogin?: (response?: FacebookLoginStatusResponse) => void;
  }
}

export type MetaOAuthFlowState =
  | 'core_onboarding'
  | 'ads_flow'
  | 'catalog_flow'
  | 'lead_capture_flow'
  | 'instagram_flow'
  | 'messenger_flow';

export interface EmbeddedSignupSession {
  solutionId: string;
  setupType: SetupType;
  signupTicket: string;
  expiresAt: string;
  wabaId: string;
  phoneNumberId?: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
  setupContext: {
    type: string;
    event: string;
    data: Record<string, unknown>;
    receivedAt: string;
    appId: string;
    configId: string;
    graphVersion: string;
    redirectUri: string;
    flowState: MetaOAuthFlowState;
    oauthState: string;
  };
}

export interface InstagramBusinessLoginSession {
  code: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
}

export interface MessengerPageLoginSession {
  code: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
}

export interface MetaAdsLoginSession {
  code: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
}

export interface MetaCatalogLoginSession {
  code: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
}

export interface MetaLeadCaptureLoginSession {
  code: string;
  redirectUri: string;
  flowState: MetaOAuthFlowState;
  oauthState: string;
}

interface MetaConfiguredLoginMessage {
  type?: string;
  state?: string | null;
  code?: string | null;
  error?: string | null;
}

let sdkPromise: Promise<void> | null = null;
let sdkInitialized = false;
let embeddedSignupActive = false;
let loginStatusPromise: Promise<FacebookLoginStatusResponse> | null = null;
let facebookLoginStatus: FacebookLoginStatus | null = null;
const loginStatusListeners = new Set<() => void>();

export function getFacebookLoginStatusSnapshot() {
  return facebookLoginStatus;
}

export function subscribeToFacebookLoginStatus(listener: () => void) {
  loginStatusListeners.add(listener);
  return () => {
    loginStatusListeners.delete(listener);
  };
}

export function statusChangeCallback(response: FacebookLoginStatusResponse) {
  if (facebookLoginStatus === response.status) {
    return;
  }

  // Facebook authorization does not establish a Connektly (Supabase) session.
  // Keep only the status in shared state, rather than copying the access token.
  facebookLoginStatus = response.status;
  loginStatusListeners.forEach((listener) => listener());
}

export const INSTAGRAM_BUSINESS_LOGIN_EVENT = 'CONNEKTLY_INSTAGRAM_BUSINESS_LOGIN';
export const META_CONFIGURED_LOGIN_EVENT = 'CONNEKTLY_META_CONFIGURED_LOGIN';
type MetaLoginConfigurationKey = keyof typeof clientConfig.metaLoginConfigurations;

function generateOauthNonce() {
  const values = new Uint32Array(4);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16)).join('');
}

function buildOauthState(flowState: MetaOAuthFlowState) {
  return `${flowState}:${generateOauthNonce()}`;
}

function getMetaLoginConfigurationId(key: MetaLoginConfigurationKey, label: string) {
  const configId = clientConfig.metaLoginConfigurations[key]?.trim();

  if (!configId) {
    throw new Error(`${label} login configuration is missing.`);
  }

  return configId;
}

function buildConfiguredLoginOptions(
  configId: string,
  oauthState: string,
  extras: Record<string, unknown> = {},
) {
  return {
    config_id: configId,
    configuration_id: configId,
    state: oauthState,
    return_scopes: true,
    auth_type: 'rerequest',
    ...extras,
  };
}

function buildMetaOAuthRedirectUri() {
  return `${window.location.origin}/auth/meta/callback`;
}

function buildConfiguredLoginUrl(args: {
  configId: string;
  oauthState: string;
  flowState: MetaOAuthFlowState;
  redirectUri: string;
  scopes?: string[];
}) {
  const url = new URL(`https://www.facebook.com/${clientConfig.meta.graphVersion}/dialog/oauth`);

  url.searchParams.set('client_id', clientConfig.meta.appId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('override_default_response_type', 'true');
  url.searchParams.set('config_id', args.configId);
  url.searchParams.set('configuration_id', args.configId);
  url.searchParams.set('state', args.oauthState);
  url.searchParams.set('auth_type', 'rerequest');
  url.searchParams.set('return_scopes', 'true');

  if (args.scopes?.length) {
    url.searchParams.set('scope', args.scopes.join(','));
  }

  url.searchParams.set(
    'extras',
    JSON.stringify({
      setup: {
        flowState: args.flowState,
      },
    }),
  );

  return url.toString();
}

function buildInstagramLoginUrl(args: {
  oauthState: string;
  redirectUri: string;
}) {
  const url = new URL('https://www.instagram.com/oauth/authorize');

  url.searchParams.set('client_id', clientConfig.instagram.appId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ].join(','));
  url.searchParams.set('state', args.oauthState);
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_authentication', '1');

  return url.toString();
}

function beginConfiguredOAuthLogin(args: {
  flowState: MetaOAuthFlowState;
  configKey: MetaLoginConfigurationKey;
  label: string;
  popupName: string;
  scopes?: string[];
}) {
  if (!clientConfig.meta.appId) {
    throw new Error(`${args.label} login is not configured. Set VITE_META_APP_ID first.`);
  }

  const configId = getMetaLoginConfigurationId(args.configKey, args.label);
  const oauthState = buildOauthState(args.flowState);
  const redirectUri = buildMetaOAuthRedirectUri();
  const popup = window.open(
    buildConfiguredLoginUrl({
      configId,
      oauthState,
      flowState: args.flowState,
      redirectUri,
      scopes: args.scopes,
    }),
    args.popupName,
    'popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no',
  );

  if (!popup) {
    throw new Error(`${args.label} login popup was blocked by the browser.`);
  }

  popup.focus();

  return new Promise<{
    code: string;
    redirectUri: string;
    flowState: MetaOAuthFlowState;
    oauthState: string;
  }>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
    };

    const rejectWith = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as MetaConfiguredLoginMessage;

      if (!payload || payload.type !== META_CONFIGURED_LOGIN_EVENT) {
        return;
      }

      if (payload.state !== oauthState) {
        return;
      }

      if (payload.error) {
        rejectWith(payload.error);
        return;
      }

      const code = payload.code?.trim();

      if (!code) {
        rejectWith(`${args.label} login did not return the expected authorization code.`);
        return;
      }

      cleanup();
      resolve({
        code,
        redirectUri,
        flowState: args.flowState,
        oauthState,
      });
    };

    const closePoll = window.setInterval(() => {
      if (!settled && popup.closed) {
        rejectWith(`${args.label} login was closed before it finished.`);
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      if (!settled) {
        rejectWith(`${args.label} login timed out before Meta returned the authorization code.`);
      }
    }, 120000);

    window.addEventListener('message', handleMessage);
  });
}

function injectMetaScript(onError: () => void) {
  if (document.getElementById('facebook-jssdk') || document.querySelector('script[data-meta-sdk="true"]')) {
    return;
  }

  const script = document.createElement('script');
  script.id = 'facebook-jssdk';
  script.src = 'https://connect.facebook.net/en_US/sdk.js';
  script.async = true;
  script.defer = true;
  script.crossOrigin = 'anonymous';
  script.dataset.metaSdk = 'true';
  script.onerror = onError;
  document.head.appendChild(script);
}

export async function ensureMetaSdkReady() {
  if (!clientConfig.meta.appId) {
    throw new Error('Meta SDK is not configured. Set VITE_META_APP_ID first.');
  }

  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out while loading the Meta SDK.'));
      }, 15000);

      window.fbAsyncInit = () => {
        try {
          const fb = window.FB;
          if (!fb) {
            throw new Error('The Meta SDK did not provide the Facebook API.');
          }

          fb.init({
            appId: clientConfig.meta.appId,
            cookie: true,
            xfbml: true,
            version: clientConfig.meta.graphVersion,
          });
          fb.AppEvents.logPageView();
          sdkInitialized = true;
          window.clearTimeout(timeout);
          resolve();
        } catch (error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      };

      if (window.FB) {
        window.fbAsyncInit();
      } else {
        injectMetaScript(() => {
          window.clearTimeout(timeout);
          reject(new Error('Failed to load the Meta SDK.'));
        });
      }
    });
  }

  return sdkPromise;
}

export async function checkFacebookLoginStatus() {
  await ensureMetaSdkReady();

  if (!loginStatusPromise) {
    loginStatusPromise = new Promise<FacebookLoginStatusResponse>((resolve, reject) => {
      const fb = window.FB;
      if (!fb) {
        reject(new Error('The Meta SDK did not provide the Facebook API.'));
        return;
      }

      let settled = false;
      const timeout = window.setTimeout(() => {
        settled = true;
        reject(new Error('Timed out while checking Facebook login status.'));
      }, 10000);

      try {
        fb.getLoginStatus((response) => {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timeout);
          statusChangeCallback(response);
          resolve(response);
        });
      } catch (error) {
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      }
    }).finally(() => {
      loginStatusPromise = null;
    });
  }

  return loginStatusPromise;
}

export function beginEmbeddedSignup(options: {
  onCode: (input: EmbeddedMetaCodeExchangeInput) => Promise<EmbeddedMetaCodeExchangeResponse>;
  signal?: AbortSignal;
  flowState?: MetaOAuthFlowState;
  setupType?: SetupType;
}): Promise<EmbeddedSignupSession> {
  // FB.login must run directly in the click handler, without awaiting SDK loading.
  if (!sdkInitialized || !window.FB) {
    return Promise.reject(new Error('Facebook is still loading. Please try again in a moment.'));
  }
  if (window.location.protocol !== 'https:') {
    return Promise.reject(new Error('Meta Embedded Signup requires HTTPS. Open Connektly using its HTTPS app URL.'));
  }
  if (embeddedSignupActive) {
    return Promise.reject(new Error('A WhatsApp signup is already open. Finish or cancel it before starting again.'));
  }
  if (options.signal?.aborted) {
    return Promise.reject(new Error('WhatsApp signup was cancelled.'));
  }

  const fb = window.FB;
  const setupType = options.setupType || 'exclusive';
  const configId = WHATSAPP_ONBOARDING_CONFIG_ID;
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const flowState = options.flowState || 'core_onboarding';
  const oauthState = buildOauthState(flowState);
  embeddedSignupActive = true;

  return new Promise<EmbeddedSignupSession>((resolve, reject) => {
    let settled = false;
    let exchanging = false;
    let authorization: EmbeddedMetaCodeExchangeResponse | null = null;
    let sessionInfo: EmbeddedSignupSession['setupContext'] | null = null;
    let detailsTimeout: number | undefined;

    const cleanup = () => {
      settled = true;
      embeddedSignupActive = false;
      window.clearTimeout(timeout);
      window.clearTimeout(detailsTimeout);
      window.removeEventListener('message', handleMessage);
      options.signal?.removeEventListener('abort', handleAbort);
    };
    const fail = (message: string) => {
      if (settled) return;
      cleanup();
      reject(new Error(message));
    };
    const handleAbort = () => fail('WhatsApp signup was cancelled.');
    const maybeResolve = () => {
      if (settled || !authorization || !sessionInfo) return;
      const wabaId = String(sessionInfo.data.waba_id || '').trim();
      const phoneNumberId = typeof sessionInfo.data.phone_number_id === 'string'
        ? sessionInfo.data.phone_number_id.trim() : undefined;
      cleanup();
      resolve({
        signupTicket: authorization.signupTicket,
        expiresAt: authorization.expiresAt,
        setupType, wabaId, phoneNumberId, redirectUri, flowState, oauthState,
        solutionId: WHATSAPP_PARTNER_SOLUTION_ID,
        setupContext: sessionInfo,
      });
    };
    const handleMessage = (event: MessageEvent) => {
      if (settled) return;
      try {
        const origin = new URL(event.origin);
        if (
          origin.protocol !== 'https:' || origin.port ||
          !(origin.hostname === 'facebook.com' || origin.hostname.endsWith('.facebook.com'))
        ) return;
      } catch {
        return;
      }

      let payload: { type?: string; event?: string; data?: Record<string, unknown> };
      try {
        payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP' || typeof payload.event !== 'string') return;
      const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
        ? payload.data : {};
      if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
        const message = typeof data.error_message === 'string' ? data.error_message : null;
        const step = typeof data.current_step === 'string' ? data.current_step : null;
        fail(message ? `Meta signup failed: ${message}` : `WhatsApp signup was cancelled${step ? ` at ${step}` : ''}. You can try again.`);
        return;
      }
      if (payload.event === 'FINISH_ONLY_WABA') {
        fail('Meta created the WhatsApp account without a phone number. Run signup again and add a phone number to connect messaging.');
        return;
      }
      const expectedFinishEvent = setupType === 'coexistence'
        ? 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' : 'FINISH';
      if (payload.event.startsWith('FINISH') && payload.event !== expectedFinishEvent) {
        fail(setupType === 'coexistence'
          ? 'Meta returned a different WhatsApp onboarding flow. Choose the option to connect your existing WhatsApp Business app account, then try again.'
          : 'Meta returned a different WhatsApp onboarding flow. This connection requires the standard Cloud API flow; use its WhatsApp Embedded Signup configuration.');
        return;
      }
      if (payload.event !== expectedFinishEvent) return;
      const wabaId = typeof data.waba_id === 'string' ? data.waba_id.trim() : '';
      const phoneNumberId = typeof data.phone_number_id === 'string' ? data.phone_number_id.trim() : '';
      if (!/^\d+$/.test(wabaId)
        || (setupType === 'exclusive' && !/^\d+$/.test(phoneNumberId))
        || (data.phone_number_id !== undefined && !/^\d+$/.test(phoneNumberId))) {
        fail('Meta finished signup without the WhatsApp account and phone number IDs. Confirm that the app domain is allowed in Facebook Login for Business, then try again.');
        return;
      }
      sessionInfo = {
        type: 'WA_EMBEDDED_SIGNUP', event: expectedFinishEvent,
        data: { ...data, waba_id: wabaId, ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}) },
        receivedAt: new Date().toISOString(),
        appId: clientConfig.meta.appId, configId,
        graphVersion: clientConfig.meta.graphVersion, redirectUri, flowState, oauthState,
      };
      maybeResolve();
    };
    const timeout = window.setTimeout(() => {
      fail('WhatsApp signup timed out. Close the Meta window and try again.');
    }, 10 * 60 * 1000);
    window.addEventListener('message', handleMessage);
    options.signal?.addEventListener('abort', handleAbort, { once: true });

    try {
      fb.login((response) => {
        if (settled || exchanging) return;
        const code = response.authResponse?.code?.trim();
        if (!code) {
          fail('Meta did not return an authorization code. Complete WhatsApp signup and grant access before continuing.');
          return;
        }
        exchanging = true;
        // Meta codes expire after 30 seconds. Exchange immediately, independently
        // of when the separate FINISH postMessage delivers the asset IDs.
        detailsTimeout = window.setTimeout(() => {
          fail('Meta authorized the connection but did not return the account details. Check the HTTPS domain and OAuth settings, then run signup again.');
        }, 60000);
        let exchange: Promise<EmbeddedMetaCodeExchangeResponse>;
        try {
          exchange = options.onCode({ code, configId, oauthState, setupType, solutionId: WHATSAPP_PARTNER_SOLUTION_ID });
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Could not exchange the Meta signup code.');
          return;
        }
        void exchange
          .then((result) => {
            if (settled) return;
            authorization = result;
            maybeResolve();
          })
          .catch((error) => fail(error instanceof Error ? error.message : 'Could not exchange the Meta signup code. Please try again.'));
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: { solutionID: WHATSAPP_PARTNER_SOLUTION_ID }, version: 'v4', sessionInfoVersion: 3,
          ...(setupType === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
        },
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Could not open Meta Embedded Signup.');
    }
  });
}

export async function beginMessengerPageLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'messenger_flow',
    configKey: 'messengerConnection',
    label: 'Messenger',
    popupName: 'connektly-messenger-login',
  });
}

export async function beginMetaAdsLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'ads_flow',
    configKey: 'adsConnection',
    label: 'Meta Ads Manager',
    popupName: 'connektly-ads-login',
    scopes: [
      'ads_management',
      'ads_read',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_ads',
    ],
  });
}

function beginInstagramOAuthLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  const flowState = options.flowState || 'instagram_flow';

  if (!clientConfig.instagram.appId) {
    throw new Error('Instagram Login is not configured. Set VITE_INSTAGRAM_APP_ID first.');
  }

  const oauthState = buildOauthState(flowState);
  const redirectUri = buildMetaOAuthRedirectUri();
  const popup = window.open(
    buildInstagramLoginUrl({
      oauthState,
      redirectUri,
    }),
    'connektly-instagram-login',
    'popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no',
  );

  if (!popup) {
    throw new Error('Instagram Login popup was blocked by the browser.');
  }

  popup.focus();

  return new Promise<{
    code: string;
    redirectUri: string;
    flowState: MetaOAuthFlowState;
    oauthState: string;
  }>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearInterval(closePoll);
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
    };

    const rejectWith = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const handleMessage = (event: MessageEvent<MetaConfiguredLoginMessage>) => {
      if (event.origin !== window.location.origin || event.data?.type !== META_CONFIGURED_LOGIN_EVENT || settled) {
        return;
      }

      if (event.data.error) {
        rejectWith(event.data.error);
        return;
      }

      const state = event.data.state || '';
      const code = event.data.code || '';

      if (state !== oauthState || !code) {
        rejectWith('Instagram Login finished without a valid authorization code.');
        return;
      }

      cleanup();
      resolve({
        code,
        redirectUri,
        flowState,
        oauthState,
      });
    };

    const closePoll = window.setInterval(() => {
      if (!settled && popup.closed) {
        rejectWith('Instagram Login popup was closed before authorization finished.');
      }
    }, 600);

    const timeout = window.setTimeout(() => {
      if (!settled) {
        rejectWith('Instagram Login timed out. Please try again.');
      }
    }, 120000);

    window.addEventListener('message', handleMessage);
  });
}

export async function beginMetaCatalogLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'catalog_flow',
    configKey: 'catalogConnection',
    label: 'Meta Catalog',
    popupName: 'connektly-catalog-login',
  });
}

export async function beginMetaLeadCaptureLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'lead_capture_flow',
    configKey: 'leadCaptureConnection',
    label: 'Lead Capture',
    popupName: 'connektly-lead-capture-login',
  });
}

export async function beginInstagramBusinessLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginInstagramOAuthLogin(options);
}
