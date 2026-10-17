// Public identifiers only. Provider credentials and wallet configuration stay on the server.
export const WHATSAPP_PARTNER_SOLUTION_ID = '1287084176407435';
export const WHATSAPP_SOLUTION_OWNER_APP_ID = '797649033413847';
export const WHATSAPP_SOLUTION_PARTNER_APP_ID = '340384197887925';

export function isWhatsAppPartnerChannel(channel: { metadata?: unknown } | null | undefined) {
  const metadata = channel?.metadata;
  const partner = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).partnerSolution : null;
  return Boolean(partner && typeof partner === 'object' && !Array.isArray(partner)
    && (partner as Record<string, unknown>).id === WHATSAPP_PARTNER_SOLUTION_ID);
}

export const WHATSAPP_PARTNER_CALLING_GUIDANCE =
  'Calling for this partner connection requires Gupshup SIP setup. Browser calling is unavailable on this connection.';
