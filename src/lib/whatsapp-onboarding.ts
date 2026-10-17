import type { MetaChannelConnection } from './types';

export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '959911236622056';

export function getWhatsAppActivationIssue(channel: MetaChannelConnection | null) {
  if (!channel) return 'Meta did not return a WhatsApp connection.';
  const metadata = channel.metadata || {};
  const registration = metadata.autoRegistration as { status?: string; lastError?: string } | undefined;
  const webhook = metadata.webhookSubscription as { isSubscribed?: boolean; lastError?: string } | undefined;
  const embedded = metadata.embeddedSignup as { lastError?: string } | undefined;
  if (registration?.status !== 'registered') {
    return registration?.lastError || embedded?.lastError || 'The WhatsApp number still needs to be registered for Cloud API.';
  }
  if (!webhook?.isSubscribed) {
    return webhook?.lastError || embedded?.lastError || 'The WhatsApp account webhook subscription still needs to be activated.';
  }
  return channel.status === 'connected' ? null : embedded?.lastError || 'WhatsApp activation is not complete. Retry activation.';
}

export function getWhatsAppPaymentSettingsUrl(wabaId?: string) {
  const url = new URL('https://business.facebook.com/wa/manage/');
  if (wabaId) url.searchParams.set('waba_id', wabaId);
  return url.toString();
}
