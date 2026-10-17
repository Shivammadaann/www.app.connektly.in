import { isWhatsAppCoexistence } from '../src/lib/whatsapp-capabilities';

export function isCoexistenceChannelRow(row: Record<string, unknown> | null | undefined) {
  return Boolean(row) && isWhatsAppCoexistence({
    setupType: row?.setup_type === 'coexistence' ? 'coexistence' : 'exclusive',
    metadata: row?.metadata as Record<string, unknown> || {},
  });
}

/** These controls belong to the primary Business app for coexistence numbers. */
export function coexistenceRestrictedAction(method: string, pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '');
  if (/^\/api\/(?:calls(?:\/|$)|meta\/call-settings$)/.test(path)) {
    return 'Place and manage calls in the WhatsApp Business app.';
  }
  if (['/api/meta/business-profile', '/api/meta/business-profile/photo',
    '/api/meta/display-name', '/api/meta/business-username', '/api/meta/official-business-account',
    '/api/meta/commerce-settings',
    '/api/meta/channel/two-step-verification', '/api/meta/channel/request-code',
    '/api/meta/channel/verify-code', '/api/meta/channel/register', '/api/meta/channel/deregister',
  ].includes(path)) {
    return 'Manage this setting in the WhatsApp Business app. Coexistence numbers must not be registered or deregistered through the Cloud API.';
  }
  if (method.toUpperCase() === 'DELETE' && ['/api/meta/channel', '/api/meta/channel/webhook-subscription'].includes(path)) {
    return 'In the WhatsApp Business app, open Settings > Account > Business Platform > Disconnect Account. Connektly will update when Meta confirms the disconnection.';
  }
  return null;
}
