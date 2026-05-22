const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api';
const META_APP_ID = import.meta.env.VITE_META_APP_ID?.trim() || '797649033413847';
// WhatsApp Embedded Signup must use this Meta configuration; other Meta flows keep their own config IDs.
export const WHATSAPP_ONBOARDING_CONFIG_ID = '959911236622056';
const META_CONFIG_ID = WHATSAPP_ONBOARDING_CONFIG_ID;
const INSTAGRAM_APP_ID =
  META_APP_ID || import.meta.env.VITE_INSTAGRAM_APP_ID?.trim() || '1364707755710909';
const INSTAGRAM_CONFIG_ID =
  import.meta.env.VITE_META_INSTAGRAM_INBOX_CONFIG_ID?.trim() || '1851191622215671';
const ADS_CONFIG_ID =
  import.meta.env.VITE_META_ADS_CONFIG_ID?.trim() || '1356104403242812';
const CATALOG_CONFIG_ID =
  import.meta.env.VITE_META_CATALOG_CONFIG_ID?.trim() || '1644345003439852';
const MESSENGER_CONFIG_ID =
  import.meta.env.VITE_META_MESSENGER_CONFIG_ID?.trim() || '1238854098066248';
const LEAD_CAPTURE_CONFIG_ID =
  import.meta.env.VITE_META_LEAD_CAPTURE_CONFIG_ID?.trim() || '1347031370653731';
const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION?.trim() || 'v24.0';
const DEFAULT_TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || '0x4AAAAAAC9513RDryb1Cua4';
const LOCAL_TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_LOCAL_SITE_KEY?.trim() || '';
const HOSTNAME =
  typeof window !== 'undefined' ? window.location.hostname.trim().toLowerCase() : '';
const IS_LOCALHOST =
  HOSTNAME === 'localhost' ||
  HOSTNAME === '127.0.0.1' ||
  HOSTNAME === '0.0.0.0' ||
  HOSTNAME === '::1' ||
  HOSTNAME === '[::1]';
const TURNSTILE_SITE_KEY = IS_LOCALHOST
  ? LOCAL_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY
  : DEFAULT_TURNSTILE_SITE_KEY;

export const clientConfig = {
  apiBaseUrl: API_BASE_URL,
  meta: {
    appId: META_APP_ID,
    configId: META_CONFIG_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  instagram: {
    appId: INSTAGRAM_APP_ID,
    configId: INSTAGRAM_CONFIG_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  messenger: {
    appId: META_APP_ID,
    configId: MESSENGER_CONFIG_ID,
    graphVersion: META_GRAPH_VERSION,
  },
  metaLoginConfigurations: {
    instagramInboxConnection: INSTAGRAM_CONFIG_ID,
    adsConnection: ADS_CONFIG_ID,
    catalogConnection: CATALOG_CONFIG_ID,
    messengerConnection: MESSENGER_CONFIG_ID,
    whatsappOnboarding: META_CONFIG_ID,
    leadCaptureConnection: LEAD_CAPTURE_CONFIG_ID,
  },
  turnstile: {
    siteKey: TURNSTILE_SITE_KEY,
    isLocalhost: IS_LOCALHOST,
    usingLocalOverride: Boolean(IS_LOCALHOST && LOCAL_TURNSTILE_SITE_KEY),
  },
};

export const hasEmbeddedSignupConfig = Boolean(META_APP_ID && META_CONFIG_ID);
export const hasInstagramBusinessLoginConfig = Boolean(INSTAGRAM_APP_ID && INSTAGRAM_CONFIG_ID);
export const hasMessengerLoginConfig = Boolean(META_APP_ID && MESSENGER_CONFIG_ID);
export const hasMetaAdsLoginConfig = Boolean(META_APP_ID && ADS_CONFIG_ID);
export const hasMetaCatalogLoginConfig = Boolean(META_APP_ID && CATALOG_CONFIG_ID);
export const hasMetaLeadCaptureLoginConfig = Boolean(META_APP_ID && LEAD_CAPTURE_CONFIG_ID);
export const hasTurnstileSiteKey = Boolean(TURNSTILE_SITE_KEY);
