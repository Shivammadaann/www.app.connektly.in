import { WHATSAPP_ONBOARDING_CONFIG_ID, clientConfig } from './config';

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
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
  }
}

export type MetaOAuthFlowState =
  | 'core_onboarding'
  | 'ads_flow'
  | 'lead_capture_flow'
  | 'instagram_flow'
  | 'messenger_flow';

interface EmbeddedSignupSession {
  code: string;
  wabaId: string;
  phoneNumberId: string;
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

function extractFlowState(oauthState: string): MetaOAuthFlowState {
  const [candidate] = oauthState.split(':');

  if (
    candidate === 'core_onboarding' ||
    candidate === 'ads_flow' ||
    candidate === 'lead_capture_flow' ||
    candidate === 'instagram_flow' ||
    candidate === 'messenger_flow'
  ) {
    return candidate;
  }

  return 'core_onboarding';
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

function injectMetaScript() {
  if (document.querySelector('script[data-meta-sdk="true"]')) {
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://connect.facebook.net/en_US/sdk.js';
  script.async = true;
  script.defer = true;
  script.dataset.metaSdk = 'true';
  document.head.appendChild(script);
}

export async function ensureMetaSdkReady() {
  if (!clientConfig.meta.appId) {
    throw new Error('Meta SDK is not configured. Set VITE_META_APP_ID first.');
  }

  if (window.FB) {
    return;
  }

  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out while loading the Meta SDK.'));
      }, 15000);

      window.fbAsyncInit = () => {
        try {
          window.FB?.init({
            appId: clientConfig.meta.appId,
            cookie: true,
            xfbml: false,
            version: clientConfig.meta.graphVersion,
          });
          window.clearTimeout(timeout);
          resolve();
        } catch (error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      };

      injectMetaScript();
    });
  }

  return sdkPromise;
}

export async function beginEmbeddedSignup(options: { flowState?: MetaOAuthFlowState } = {}) {
  const configId = WHATSAPP_ONBOARDING_CONFIG_ID;
  await ensureMetaSdkReady();
  const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const flowState = options.flowState || 'core_onboarding';
  const oauthState = buildOauthState(flowState);

  return new Promise<EmbeddedSignupSession>((resolve, reject) => {
    let authCode: string | null = null;
    let sessionInfo: {
      wabaId?: string;
      phoneNumberId?: string;
      setupContext?: EmbeddedSignupSession['setupContext'];
    } = {};

    const maybeResolve = () => {
      if (authCode && sessionInfo.wabaId && sessionInfo.phoneNumberId) {
        cleanup();
        resolve({
          code: authCode,
          wabaId: sessionInfo.wabaId,
          phoneNumberId: sessionInfo.phoneNumberId,
          redirectUri,
          flowState,
          oauthState,
          setupContext:
            sessionInfo.setupContext || {
              type: 'WA_EMBEDDED_SIGNUP',
              event: 'FINISH',
              data: {
                waba_id: sessionInfo.wabaId,
                phone_number_id: sessionInfo.phoneNumberId,
              },
              receivedAt: new Date().toISOString(),
              appId: clientConfig.meta.appId,
              configId,
              graphVersion: clientConfig.meta.graphVersion,
              redirectUri,
              flowState,
              oauthState,
            },
        });
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const trustedOrigin = typeof event.origin === 'string' && event.origin.includes('facebook.com');

      if (!trustedOrigin || typeof event.data !== 'string') {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          event?: string;
          data?: Record<string, unknown>;
        };

        if (payload.type !== 'WA_EMBEDDED_SIGNUP' || payload.event !== 'FINISH') {
          return;
        }

        sessionInfo = {
          wabaId: typeof payload.data?.waba_id === 'string' ? payload.data.waba_id : undefined,
          phoneNumberId:
            typeof payload.data?.phone_number_id === 'string'
              ? payload.data.phone_number_id
              : undefined,
          setupContext: {
            type: payload.type,
            event: payload.event,
            data: payload.data || {},
            receivedAt: new Date().toISOString(),
            appId: clientConfig.meta.appId,
            configId,
            graphVersion: clientConfig.meta.graphVersion,
            redirectUri,
            flowState,
            oauthState,
          },
        };
        maybeResolve();
      } catch {
        return;
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);
    const fb = window.FB;
    if (!fb) {
      cleanup();
      reject(new Error('Meta SDK did not initialize correctly.'));
      return;
    }

    fb.login(
      (response) => {
        if (response.status !== 'connected' || !response.authResponse?.code) {
          cleanup();
          reject(new Error('Meta signup was cancelled before authorization completed.'));
          return;
        }

        authCode = response.authResponse.code;
        window.setTimeout(() => {
          if (!sessionInfo.wabaId || !sessionInfo.phoneNumberId) {
            cleanup();
            reject(
              new Error(
                'Meta signup finished but the account identifiers were not returned. Use manual connection as a fallback.',
              ),
            );
            return;
          }

          maybeResolve();
        }, 3000);
      },
      buildConfiguredLoginOptions(configId, oauthState, {
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: 3,
          featureType: 'whatsapp_embedded_signup',
          flowState,
        },
      }),
    );
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

export async function beginMetaLeadCaptureLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'lead_capture_flow',
    configKey: 'leadCaptureConnection',
    label: 'Lead Capture',
    popupName: 'connektly-lead-capture-login',
  });
}

export async function beginInstagramBusinessLogin(options: { flowState?: MetaOAuthFlowState } = {}) {
  return beginConfiguredOAuthLogin({
    flowState: options.flowState || 'instagram_flow',
    configKey: 'instagramInboxConnection',
    label: 'Instagram Business Login',
    popupName: 'connektly-instagram-business-login',
  });
}
