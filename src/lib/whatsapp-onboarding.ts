import type { MetaChannelConnection } from './types';
import { getWhatsAppCoexistenceSync, isWhatsAppCoexistence } from './whatsapp-capabilities';
import { isWhatsAppPartnerChannel } from './whatsapp-partner';

export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = '959911236622056';

export function getWhatsAppActivationIssue(channel: MetaChannelConnection | null) {
  if (!channel) return 'Meta did not return a WhatsApp connection.';
  const metadata = channel.metadata || {};
  const registration = metadata.autoRegistration as { status?: string; lastError?: string } | undefined;
  const webhook = metadata.webhookSubscription as { isSubscribed?: boolean; lastError?: string } | undefined;
  const embedded = metadata.embeddedSignup as { lastError?: string } | undefined;
  if (isWhatsAppPartnerChannel(channel)) {
    const provider = metadata.gupshup as { status?: string; lastError?: string } | undefined;
    if (provider?.status !== 'ready' || channel.status !== 'connected') {
      return provider?.lastError || embedded?.lastError || 'Partner setup is pending. Check the connection to confirm the Gupshup app, wallet route, and callback.';
    }
    return null;
  }
  if (isWhatsAppCoexistence(channel)) {
    const coexistence = metadata.coexistence as { isOnBizApp?: boolean; platformType?: string } | undefined;
    if (coexistence?.isOnBizApp !== true || coexistence.platformType !== 'CLOUD_API') {
      return embedded?.lastError || 'Meta has not confirmed this number is connected to both the WhatsApp Business app and Cloud API.';
    }
    if (!webhook?.isSubscribed) {
      return webhook?.lastError || embedded?.lastError || 'The WhatsApp account webhook subscription still needs to be activated.';
    }
    const sync = getWhatsAppCoexistenceSync(channel);
    if (!sync || sync.contacts.status === 'not_requested' || sync.history.status === 'not_requested') {
      return embedded?.lastError || 'Initial contacts and chat history synchronization has not started. Check the connection status to continue.';
    }
    if (sync?.contacts.needsRecovery || sync?.history.needsRecovery) {
      return embedded?.lastError || sync.history.lastError || sync.contacts.lastError
        || 'Synchronization needs attention. Review the connection status before reconnecting from the WhatsApp Business app.';
    }
    return channel.status === 'connected' ? null
      : embedded?.lastError || 'WhatsApp Business app setup is still being confirmed. Check the connection status to continue.';
  }
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
