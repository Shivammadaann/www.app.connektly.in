/** Gupshup acknowledges a provider ID first; Meta's wamid arrives in status callbacks. */
export function getWhatsAppMessageId(message: { waMessageId?: string | null; raw?: Record<string, unknown> } | null | undefined) {
  if (message?.waMessageId?.startsWith('wamid.')) return message.waMessageId;
  const alias = message?.raw?.gupshup_whatsapp_message_id;
  return typeof alias === 'string' && alias.startsWith('wamid.') ? alias : null;
}
